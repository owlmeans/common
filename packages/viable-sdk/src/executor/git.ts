import { execFile } from 'node:child_process'
import fsp from 'node:fs/promises'
import p from 'node:path'

import { SlotGitCommand, type SlotGitCommitInfo, type SlotGitFileChange, type SlotGitStatus } from '@owlmeans/viable-common'

import { GitDirtyTree, LocalGitError } from './errors.js'
import { MAX_OUTPUT_BUFFER, CLONE_REFUSAL, IGNORE_BASELINE, REMOTE_REFUSAL } from './consts.js'
import { DEFAULT_BRANCH, DEFAULT_GIT_USER_EMAIL, DEFAULT_GIT_USER_NAME, LOG_FORMAT, LOG_LIMIT, STATUS_FILES_CAP } from './consts.local.js'
import type { GitResult } from './types.local.js'
import type { LocalGitHelper } from './git/types.js'

export { CLONE_REFUSAL, IGNORE_BASELINE, REMOTE_REFUSAL } from './consts.js'



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
 * Git in ONE local project directory, answered the way the publisher answers a slot's git commands.
 */
export const makeLocalGitHelper = (dir: string): LocalGitHelper => {
  /**
   * Run one git command.
   *
   * `core.quotePath=false` so a path with a non-ASCII character comes back as itself rather than as
   * an escaped C string nothing downstream un-escapes. `GIT_TERMINAL_PROMPT=0` so a command that
   * wants credentials fails instead of blocking on a prompt no one can answer.
   */
  const git = async (args: string[]): Promise<GitResult> =>
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

  const headInfo = async (): Promise<SlotGitCommitInfo | null> => {
    const result = await git(['log', '-1', LOG_FORMAT])

    return result.ok ? parseCommits(result.out)[0] ?? null : null
  }

  /**
   * Whether the tree has anything uncommitted, untracked files included.
   *
   * Asked before `add -A` rather than after, so a clean tree is reported as clean instead of
   * producing an empty commit.
   */
  const isDirty = async (): Promise<boolean> => {
    const result = await git(['status', '--porcelain', '-u'])

    return result.out.trim() !== ''
  }

  /**
   * Ahead/behind against the remote-tracking ref, when porcelain did not say.
   *
   * A branch with no upstream configured still has an `origin/<branch>` ref after a fetch, and that
   * is what a caller wants to know about.
   */
  const localCounts = async (
    branch: string
  ): Promise<{ ahead: number | null, behind: number | null }> => {
    const result = await git([
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
  const ensure = async (): Promise<void> => {
    const created = await fsp.stat(p.join(dir, '.git')).then(() => false, () => true)
    if (created) {
      const init = await git(['init', '-b', DEFAULT_BRANCH])
      if (!init.ok) {
        // `-b` arrived in git 2.28; an older one still initializes and is then pointed at `main`.
        const fallback = await git(['init'])
        if (!fallback.ok) {
          throw new LocalGitError(`git init failed in ${dir}: ${fallback.err.trim()}`)
        }
        await git(['symbolic-ref', 'HEAD', `refs/heads/${DEFAULT_BRANCH}`])
      }
    }

    for (const [key, value] of [
      ['user.name', DEFAULT_GIT_USER_NAME], ['user.email', DEFAULT_GIT_USER_EMAIL]
    ] as const) {
      const current = await git(['config', '--get', key])
      if (!current.ok || current.out.trim() === '') {
        await git(['config', '--local', key, value])
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

  const status = async (): Promise<SlotGitStatus> => {
    const porcelain = await git(['status', '--porcelain=v1', '-b', '-u'])
    const { branch, files, ahead, behind } = parseStatus(porcelain.out)

    const remote = await git(['remote', 'get-url', 'origin'])
    const remoteUrl = remote.ok && remote.out.trim() !== '' ? remote.out.trim() : null

    const counts = ahead != null || behind != null
      ? { ahead, behind }
      : await localCounts(branch)

    return {
      initialized: true,
      head: await headInfo(),
      branch,
      dirty: files.length > 0,
      changedFiles: files.length,
      files: files.slice(0, STATUS_FILES_CAP),
      remoteUrl,
      ahead: counts.ahead,
      behind: counts.behind,
    }
  }

  const _dispatch = async (
    command: SlotGitCommand, args?: Record<string, any>
  ): Promise<Record<string, unknown>> => {
    switch (command) {
      case SlotGitCommand.Ensure:
        await ensure()

        return {}

      case SlotGitCommand.Status:
        await ensure()

        return await status() as unknown as Record<string, unknown>

      case SlotGitCommand.Commit: {
        await ensure()
        if (!await isDirty()) {
          return { commit: null }
        }

        const add = await git(['add', '-A'])
        if (!add.ok) {
          throw new LocalGitError(`git add failed: ${add.err.trim()}`)
        }
        const message = typeof args?.message === 'string' && args.message !== ''
          ? args.message
          : 'chore: update project'
        const commit = await git(['commit', '-m', message])
        if (!commit.ok) {
          throw new LocalGitError(`git commit failed: ${(commit.err || commit.out).trim()}`)
        }

        return { commit: await headInfo() }
      }

      case SlotGitCommand.Log: {
        await ensure()
        const result = await git(['log', `--max-count=${LOG_LIMIT}`, LOG_FORMAT])

        return { commits: result.ok ? parseCommits(result.out) : [] }
      }

      case SlotGitCommand.Discard: {
        await ensure()
        // On an unborn branch HEAD does not exist — there is nothing to reset to, and a `clean`
        // there would delete a tree nobody has committed yet.
        if (await headInfo() == null) {
          return await status() as unknown as Record<string, unknown>
        }

        await git(['reset', '--hard', 'HEAD'])
        // `.viable/` is excluded by name: the marker is what identifies this directory as a
        // platform project at all, it is untracked until someone commits it, and a discard that
        // swept it would leave a tree no connector can recognize afterwards.
        await git(['clean', '-fd', '-e', '.viable'])

        return await status() as unknown as Record<string, unknown>
      }

      case SlotGitCommand.RevertTo: {
        await ensure()
        const hash = typeof args?.hash === 'string' ? args.hash : ''
        if (hash === '') {
          throw new LocalGitError('revert-no-hash')
        }
        // A revert overwrites the working tree, so uncommitted work would be lost with no way back.
        if (await isDirty()) {
          throw new GitDirtyTree(dir)
        }

        const target = await git(['log', '-1', '--format=%h%x1f%s', hash])
        if (!target.ok) {
          throw new LocalGitError(`invalid-hash:${hash}`)
        }
        const [shortHash, ...subjectParts] = target.out.trim().split('\x1f')
        const subject = subjectParts.join('\x1f')

        // APPEND-ONLY. `read-tree` restores the old content as a NEW commit on top of the current
        // history, so nothing that ever happened is unmade — a reset would rewrite history a person
        // may already have pushed or be working from.
        const read = await git(['read-tree', '-u', '--reset', hash])
        if (!read.ok) {
          throw new LocalGitError(`revert-failed: ${read.err.trim()}`)
        }

        // Reverting to what HEAD already holds changes nothing; answering with the current head is
        // the honest result, and an empty commit would only add noise to the history.
        if (!await isDirty()) {
          return { commit: await headInfo() }
        }

        const commit = await git(['commit', '-m', `revert: restore ${shortHash} — ${subject}`])
        if (!commit.ok) {
          throw new LocalGitError(`revert-commit-failed: ${(commit.err || commit.out).trim()}`)
        }

        const head = await headInfo()
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

  const dispatchGitCommand = async (
    command: SlotGitCommand, args?: Record<string, any>
  ): Promise<Record<string, unknown>> =>
    await serialize(dir, async () => await _dispatch(command, args))

  return { dispatchGitCommand, ensureGitRepo: ensure }
}
