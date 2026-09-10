import { execFile } from 'node:child_process'
import fsp from 'node:fs/promises'
import p from 'node:path'

import { SlotGitCommand } from '@owlmeans/viable-common'
import type { SlotGitCommitInfo, SlotGitFileChange, SlotGitStatus } from '@owlmeans/viable-common'

import { GitDirtyTree, LocalGitError } from './errors.js'
import { MAX_OUTPUT_BUFFER } from './spawn.js'

/**
 * The git half of the local executor, over the `git` CLI.
 *
 * The platform's own implementation is `@owlmeans/git`, which is private and carries `simple-git`
 * and a GitHub client — neither of which may reach a package a developer installs to drive their
 * own machine. So the semantics are ported and the two constants below are copied, with this
 * comment as the record of where they came from: a connector that invented its own author name
 * would produce a history that does not match what the platform writes for the same project in a
 * slot.
 */
const DEFAULT_BRANCH = 'main'
const DEFAULT_GIT_USER_NAME = 'OwlMeans Viable'
const DEFAULT_GIT_USER_EMAIL = 'agent@owlmeans.com'

const LOG_LIMIT = 20
const STATUS_FILES_CAP = 50

/**
 * The runtime safety net `ensure` appends, so a first commit never captures dependencies, build
 * output, secrets or the connector's own scratch files.
 *
 * `.viable/connect.json` is deliberately NOT here: it is the project's identity, it holds no
 * secret, and a developer who clones their own repository elsewhere should find it. The two files
 * beside it are — a run record names pids on one machine, and the local keypair is a credential.
 */
const IGNORE_BASELINE = [
  'node_modules/',
  'dist/',
  'build/',
  '.env',
  '.viable/run.json',
  '.viable/local.json',
  'tsconfig.tsbuildinfo',
]

/**
 * Why a local repository is never pushed, pulled or given a remote.
 *
 * DELIBERATE DIFFERENCE from the publisher, which does all three against a token the platform
 * holds. A slot's volume is the platform's and its remote is a repository the platform created;
 * a developer's checkout is THEIRS, its remote is whatever they configured, and pushing to it
 * would mean the platform writing to a repository nobody here was asked about — with the
 * developer's own credential helper supplying the authentication. So the platform touches none
 * of it: whoever owns the directory owns its remotes.
 */
const REMOTE_REFUSAL = 'This project lives on your own machine, so the platform does not touch its '
  + 'git remotes. Push, pull and remote configuration are yours to run.'

/**
 * Why a local target is never cloned into.
 *
 * A clone exists for one case — the platform fetching an origin repository onto a slot's volume it
 * owns — and a local target has already answered that question: the directory the connector was
 * started in IS the origin, and there is nothing to fetch. Overwriting it with a remote tree would
 * replace a developer's working copy, including whatever they had not committed.
 *
 * Answered as TEXT beside {@link REMOTE_REFUSAL} and never thrown, for the same reason: a caller
 * that received an exception would retry something that can never succeed, while a `cloned: false`
 * in the shape it already parses is a fact its next step can read.
 */
const CLONE_REFUSAL = 'This project is the directory the connector was started in, so there is '
  + 'nothing to clone into it. Its sources are already here.'

/**
 * Tail of the serialization chain per working directory.
 *
 * Git takes `.git/*.lock` files for the duration of a write, so two concurrent operations on one
 * repository fail with `could not lock config file .git/config: File exists`. That is not
 * hypothetical: every command here calls `ensure()` first, and two unsynchronized producers
 * routinely overlap — an explicit status call and whatever status the connector rides along with
 * its own reporting.
 */
const _chains = new Map<string, Promise<unknown>>()

const serialize = async <T>(dir: string, op: () => Promise<T>): Promise<T> => {
  // Chain onto whatever is already queued for this dir, running `op` whether the previous command
  // resolved or rejected so one failure never poisons the queue behind it.
  const previous = _chains.get(dir) ?? Promise.resolve()
  const result = previous.then(op, op)

  const tail = result.then(() => undefined, () => undefined)
  _chains.set(dir, tail)
  // Drop the entry once nothing else has queued behind it, so the map cannot grow without bound.
  void tail.then(() => {
    if (_chains.get(dir) === tail) {
      _chains.delete(dir)
    }
  })

  return await result
}

interface GitResult {
  ok: boolean
  out: string
  err: string
}

/**
 * Run one git command.
 *
 * `core.quotePath=false` so a path with a non-ASCII character comes back as itself rather than as
 * an escaped C string nothing downstream un-escapes. `GIT_TERMINAL_PROMPT=0` so a command that
 * wants credentials fails instead of blocking on a prompt no one can answer.
 */
const git = async (dir: string, args: string[]): Promise<GitResult> =>
  await new Promise<GitResult>(resolve => {
    execFile(
      'git',
      ['-c', 'core.quotePath=false', ...args],
      {
        cwd: dir,
        maxBuffer: MAX_OUTPUT_BUFFER,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (error, stdout, stderr) => resolve({ ok: error == null, out: stdout, err: stderr })
    )
  })

// Unit separator: it cannot appear in any of the fields, so a subject with tabs or spaces in it
// still parses.
const LOG_FORMAT = '--format=%H%x1f%h%x1f%an%x1f%ae%x1f%cI%x1f%s'

const parseCommits = (out: string): SlotGitCommitInfo[] => out
  .split('\n')
  .map(line => line.trim())
  .filter(line => line !== '')
  .map(line => {
    const [hash, shortHash, authorName, authorEmail, committedAt, ...subject] = line.split('\x1f')

    return {
      hash, shortHash, authorName, authorEmail, committedAt, subject: subject.join('\x1f'),
    } satisfies SlotGitCommitInfo
  })

const headInfo = async (dir: string): Promise<SlotGitCommitInfo | null> => {
  const result = await git(dir, ['log', '-1', LOG_FORMAT])

  return result.ok ? parseCommits(result.out)[0] ?? null : null
}

/**
 * Whether the tree has anything uncommitted, untracked files included.
 *
 * Asked before `add -A` rather than after, so a clean tree is reported as clean instead of
 * producing an empty commit.
 */
const isDirty = async (dir: string): Promise<boolean> => {
  const result = await git(dir, ['status', '--porcelain', '-u'])

  return result.out.trim() !== ''
}

const parseStatus = (out: string): {
  branch: string, files: SlotGitFileChange[], ahead: number | null, behind: number | null
} => {
  const lines = out.split('\n').filter(line => line !== '')
  let branch = DEFAULT_BRANCH
  let ahead: number | null = null
  let behind: number | null = null
  const files: SlotGitFileChange[] = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      let rest = line.slice(3)
      const tracking = /\s\[(.+)\]$/.exec(rest)
      if (tracking != null) {
        rest = rest.slice(0, tracking.index)
        const aheadMatch = /ahead (\d+)/.exec(tracking[1])
        const behindMatch = /behind (\d+)/.exec(tracking[1])
        if (aheadMatch != null) ahead = parseInt(aheadMatch[1])
        if (behindMatch != null) behind = parseInt(behindMatch[1])
        // A branch with an upstream but no divergence reports neither word; both are zero.
        if (aheadMatch == null && behindMatch == null && !/gone/.test(tracking[1])) {
          ahead = 0
          behind = 0
        }
      }
      // `## No commits yet on main` is what an unborn branch says about itself.
      branch = rest.split('...')[0].replace(/^No commits yet on /, '').trim()
      if (branch === '' || branch === 'HEAD (no branch)') branch = DEFAULT_BRANCH
      continue
    }

    const status = `${line[0] ?? ''}${line[1] ?? ''}`.trim()
    const raw = line.slice(3)
    // A rename reads `R  old -> new`; the new path is the one that exists.
    const path = raw.includes(' -> ') ? raw.slice(raw.indexOf(' -> ') + 4) : raw
    files.push({ path, status })
  }

  return { branch, files, ahead, behind }
}

/**
 * Ahead/behind against the remote-tracking ref, when porcelain did not say.
 *
 * A branch with no upstream configured still has an `origin/<branch>` ref after a fetch, and that
 * is what a caller wants to know about.
 */
const localCounts = async (
  dir: string, branch: string
): Promise<{ ahead: number | null, behind: number | null }> => {
  const result = await git(dir, [
    'rev-list', '--left-right', '--count', `${branch}...origin/${branch}`
  ])
  if (!result.ok) {
    return { ahead: null, behind: null }
  }
  const parts = result.out.trim().split(/\s+/)

  return parts.length === 2
    ? { ahead: parseInt(parts[0]), behind: parseInt(parts[1]) }
    : { ahead: null, behind: null }
}

/**
 * Make the directory a repository the platform can work in, and change nothing else.
 *
 * DELIBERATE DIFFERENCE from the publisher on two points, both because this history belongs to a
 * person rather than to a slot:
 *
 * - **No baseline commit.** The publisher snapshots a pre-git slot into a first commit so its
 *   history starts clean. Here the first commit is the developer's to make (or not) — a tool that
 *   committed a working tree it found is a tool that decided what their project's history says.
 * - **An identity only when there is none.** `git config user.name` consults local, global and
 *   system, so a developer with a global identity keeps authoring as themselves. Writing the
 *   platform's name unconditionally would rewrite the author of every commit made in that
 *   directory afterwards, including ones the platform had nothing to do with.
 */
const ensure = async (dir: string): Promise<void> => {
  const created = await fsp.stat(p.join(dir, '.git')).then(() => false, () => true)
  if (created) {
    const init = await git(dir, ['init', '-b', DEFAULT_BRANCH])
    if (!init.ok) {
      // `-b` arrived in git 2.28; an older one still initializes and is then pointed at `main`.
      const fallback = await git(dir, ['init'])
      if (!fallback.ok) {
        throw new LocalGitError(`git init failed in ${dir}: ${fallback.err.trim()}`)
      }
      await git(dir, ['symbolic-ref', 'HEAD', `refs/heads/${DEFAULT_BRANCH}`])
    }
  }

  for (const [key, value] of [
    ['user.name', DEFAULT_GIT_USER_NAME], ['user.email', DEFAULT_GIT_USER_EMAIL]
  ] as const) {
    const current = await git(dir, ['config', '--get', key])
    if (!current.ok || current.out.trim() === '') {
      await git(dir, ['config', '--local', key, value])
    }
  }

  const ignorePath = p.join(dir, '.gitignore')
  const existing = await fsp.readFile(ignorePath, 'utf8').catch(() => '')
  const lines = new Set(existing.split('\n').map(line => line.trim()))
  const missing = IGNORE_BASELINE.filter(entry => !lines.has(entry))
  if (missing.length > 0) {
    const prefix = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`
    await fsp.writeFile(ignorePath, `${prefix}${missing.join('\n')}\n`)
  }
}

const status = async (dir: string): Promise<SlotGitStatus> => {
  const porcelain = await git(dir, ['status', '--porcelain=v1', '-b', '-u'])
  const { branch, files, ahead, behind } = parseStatus(porcelain.out)

  const remote = await git(dir, ['remote', 'get-url', 'origin'])
  const remoteUrl = remote.ok && remote.out.trim() !== '' ? remote.out.trim() : null

  const counts = ahead != null || behind != null
    ? { ahead, behind }
    : await localCounts(dir, branch)

  return {
    initialized: true,
    head: await headInfo(dir),
    branch,
    dirty: files.length > 0,
    changedFiles: files.length,
    files: files.slice(0, STATUS_FILES_CAP),
    remoteUrl,
    ahead: counts.ahead,
    behind: counts.behind,
  }
}

export const dispatchGitCommand = async (
  dir: string, command: SlotGitCommand, args?: Record<string, any>
): Promise<Record<string, unknown>> =>
  await serialize(dir, async () => await _dispatch(dir, command, args))

const _dispatch = async (
  dir: string, command: SlotGitCommand, args?: Record<string, any>
): Promise<Record<string, unknown>> => {
  switch (command) {
    case SlotGitCommand.Ensure:
      await ensure(dir)

      return {}

    case SlotGitCommand.Status:
      await ensure(dir)

      return await status(dir) as unknown as Record<string, unknown>

    case SlotGitCommand.Commit: {
      await ensure(dir)
      if (!await isDirty(dir)) {
        return { commit: null }
      }

      const add = await git(dir, ['add', '-A'])
      if (!add.ok) {
        throw new LocalGitError(`git add failed: ${add.err.trim()}`)
      }
      const message = typeof args?.message === 'string' && args.message !== ''
        ? args.message
        : 'chore: update project'
      const commit = await git(dir, ['commit', '-m', message])
      if (!commit.ok) {
        throw new LocalGitError(`git commit failed: ${(commit.err || commit.out).trim()}`)
      }

      return { commit: await headInfo(dir) }
    }

    case SlotGitCommand.Log: {
      await ensure(dir)
      const result = await git(dir, ['log', `--max-count=${LOG_LIMIT}`, LOG_FORMAT])

      return { commits: result.ok ? parseCommits(result.out) : [] }
    }

    case SlotGitCommand.Discard: {
      await ensure(dir)
      // On an unborn branch HEAD does not exist — there is nothing to reset to, and a `clean`
      // there would delete a tree nobody has committed yet.
      if (await headInfo(dir) == null) {
        return await status(dir) as unknown as Record<string, unknown>
      }

      await git(dir, ['reset', '--hard', 'HEAD'])
      // `.viable/` is excluded by name: the marker is what identifies this directory as a
      // platform project at all, it is untracked until someone commits it, and a discard that
      // swept it would leave a tree no connector can recognize afterwards.
      await git(dir, ['clean', '-fd', '-e', '.viable'])

      return await status(dir) as unknown as Record<string, unknown>
    }

    case SlotGitCommand.RevertTo: {
      await ensure(dir)
      const hash = typeof args?.hash === 'string' ? args.hash : ''
      if (hash === '') {
        throw new LocalGitError('revert-no-hash')
      }
      // A revert overwrites the working tree, so uncommitted work would be lost with no way back.
      if (await isDirty(dir)) {
        throw new GitDirtyTree(dir)
      }

      const target = await git(dir, ['log', '-1', '--format=%h%x1f%s', hash])
      if (!target.ok) {
        throw new LocalGitError(`invalid-hash:${hash}`)
      }
      const [shortHash, ...subjectParts] = target.out.trim().split('\x1f')
      const subject = subjectParts.join('\x1f')

      // APPEND-ONLY. `read-tree` restores the old content as a NEW commit on top of the current
      // history, so nothing that ever happened is unmade — a reset would rewrite history a person
      // may already have pushed or be working from.
      const read = await git(dir, ['read-tree', '-u', '--reset', hash])
      if (!read.ok) {
        throw new LocalGitError(`revert-failed: ${read.err.trim()}`)
      }

      // Reverting to what HEAD already holds changes nothing; answering with the current head is
      // the honest result, and an empty commit would only add noise to the history.
      if (!await isDirty(dir)) {
        return { commit: await headInfo(dir) }
      }

      const commit = await git(dir, ['commit', '-m', `revert: restore ${shortHash} — ${subject}`])
      if (!commit.ok) {
        throw new LocalGitError(`revert-commit-failed: ${(commit.err || commit.out).trim()}`)
      }

      const head = await headInfo(dir)
      if (head == null) {
        throw new LocalGitError('revert-no-head')
      }

      return { commit: head }
    }

    // The three that touch a remote. Answered as TEXT rather than thrown: this is a policy, not a
    // failure, and a caller that treats it as an error would retry something that can never
    // succeed. The `GitSyncResult` fields travel beside it so a caller reading that shape finds
    // the fields it expects instead of `undefined`.
    case SlotGitCommand.SetRemote:
    case SlotGitCommand.Push:
    case SlotGitCommand.Pull:
      return { result: REMOTE_REFUSAL, status: 'no-remote', ahead: null, behind: null, message: REMOTE_REFUSAL }

    // The fourth, refused in the same shape and for the same reason — see CLONE_REFUSAL. The
    // convert pipeline skips its clone step on a local target, so this is the belt to that
    // braces: a command that arrives anyway answers a fact rather than failing a run.
    case SlotGitCommand.Clone:
      return { cloned: false, branch: '', head: null, result: CLONE_REFUSAL }

    default:
      throw new LocalGitError(`Unknown git command: ${String(command)}`)
  }
}

export { CLONE_REFUSAL, ensure as ensureGitRepo, IGNORE_BASELINE, REMOTE_REFUSAL }
