import { afterEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import fse from 'fs-extra'
import os from 'node:os'
import path from 'node:path'

import { SlotGitCommand } from '@owlmeans/viable-common'
import type { SlotGitCommitInfo, SlotGitStatus } from '@owlmeans/viable-common'

import { GitDirtyTree } from '../src/executor/errors.js'
import { dispatchGitCommand, IGNORE_BASELINE } from '../src/executor/git.js'

/**
 * The git half of the local executor, against a real repository.
 *
 * Everything here is about the same distinction: a slot's repository is the platform's and a
 * developer's is theirs. So `ensure` adds what the platform needs and changes nothing else, a
 * revert appends rather than rewrites, and the three commands that would touch a remote refuse.
 *
 * Gated on a usable `git`, and self-skipping rather than failing: a machine without one is a
 * machine this suite has nothing to say about.
 */
const HAS_GIT = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })

    return true
  } catch {
    return false
  }
})()

if (!HAS_GIT) {
  console.warn('viable-sdk — git: skipped, `git --version` did not run on this machine.')
}

/**
 * Whether this git can be made to forget the developer's own identity.
 *
 * `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_SYSTEM` arrived in git 2.32. Without them there is no way to
 * observe the "nobody is configured" branch on a machine whose owner is, so that one test states
 * why it is not running instead of asserting something it cannot arrange.
 */
const ISOLATABLE = HAS_GIT && ((): boolean => {
  try {
    execFileSync('git', ['config', '--get', 'user.name'], {
      cwd: os.tmpdir(),
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
      stdio: 'ignore',
    })

    return false
  } catch {
    return true
  }
})()

if (HAS_GIT && !ISOLATABLE) {
  console.warn('viable-sdk — git: the no-identity case is skipped, this git ignores GIT_CONFIG_GLOBAL.')
}

const restoreEnv = (key: string, value: string | undefined): void => {
  if (value == null) {
    delete process.env[key]

    return
  }
  process.env[key] = value
}

describe.skipIf(!HAS_GIT)('viable-sdk — local git', () => {
  const roots: string[] = []

  const sandbox = async (files: Record<string, string> = {}): Promise<string> => {
    const root = await fse.mkdtemp(path.join(os.tmpdir(), 'viable-sdk-git-'))
    roots.push(root)
    for (const [file, content] of Object.entries(files)) {
      await fse.ensureDir(path.join(root, path.dirname(file)))
      await fse.writeFile(path.join(root, file), content)
    }

    return root
  }

  afterEach(async () => {
    while (roots.length > 0) await fse.remove(roots.pop() as string)
  })

  const run = async (
    dir: string, command: SlotGitCommand, args?: Record<string, unknown>
  ): Promise<Record<string, unknown>> => await dispatchGitCommand(dir, command, args)

  const status = async (dir: string): Promise<SlotGitStatus> =>
    await run(dir, SlotGitCommand.Status) as unknown as SlotGitStatus

  const commit = async (dir: string, message: string): Promise<SlotGitCommitInfo | null> =>
    (await run(dir, SlotGitCommand.Commit, { message })).commit as SlotGitCommitInfo | null

  describe('ensure', () => {
    test('creates the repository on `main` and is idempotent', async () => {
      const root = await sandbox({ 'package.json': '{}' })

      await run(root, SlotGitCommand.Ensure)
      expect(await fse.pathExists(path.join(root, '.git'))).toBe(true)
      const first = await fse.readFile(path.join(root, '.gitignore'), 'utf-8')

      await run(root, SlotGitCommand.Ensure)
      const second = await fse.readFile(path.join(root, '.gitignore'), 'utf-8')

      expect(second).toBe(first)
      // Each baseline entry exactly once — a second `ensure` that appended again would grow the
      // file on every command, since every command calls it.
      for (const entry of IGNORE_BASELINE) {
        expect(first.split('\n').filter(line => line.trim() === entry)).toHaveLength(1)
      }
      expect((await status(root)).branch).toBe('main')
    })

    test('an existing .gitignore keeps its own lines and gains only what is missing', async () => {
      const root = await sandbox({ '.gitignore': 'node_modules/\nmy-scratch/\n' })

      await run(root, SlotGitCommand.Ensure)
      const written = await fse.readFile(path.join(root, '.gitignore'), 'utf-8')

      expect(written).toContain('my-scratch/')
      expect(written.split('\n').filter(line => line.trim() === 'node_modules/')).toHaveLength(1)
      expect(written).toContain('.viable/local.json')
    })

    test('an identity the developer already configured is left alone', async () => {
      // `git config --get` consults local, global and system. Writing the platform's name
      // unconditionally would re-author every commit made in that directory afterwards.
      const root = await sandbox()
      execFileSync('git', ['init', '-q'], { cwd: root })
      execFileSync('git', ['config', 'user.name', 'Ada Lovelace'], { cwd: root })
      execFileSync('git', ['config', 'user.email', 'ada@example.org'], { cwd: root })

      await run(root, SlotGitCommand.Ensure)

      expect(execFileSync('git', ['config', '--get', 'user.name'], { cwd: root }).toString().trim())
        .toBe('Ada Lovelace')
    })

    test('makes no baseline commit — the first commit is the developer\'s to make', async () => {
      const root = await sandbox({ 'package.json': '{}' })

      await run(root, SlotGitCommand.Ensure)

      const state = await status(root)
      expect(state.head).toBeNull()
      expect(state.dirty).toBe(true)
    })
  })

  describe('status and commit', () => {
    test('a clean tree answers { commit: null } rather than an empty commit', async () => {
      const root = await sandbox({ 'a.txt': 'one' })
      await commit(root, 'chore: initial')

      expect(await commit(root, 'chore: nothing changed')).toBeNull()
    })

    test('a commit answers the info the platform renders', async () => {
      const root = await sandbox({ 'a.txt': 'one' })

      const info = await commit(root, 'feat: add a thing')

      expect(info?.subject).toBe('feat: add a thing')
      expect(info?.hash).toMatch(/^[0-9a-f]{40}$/)
      expect(info?.hash.startsWith(info.shortHash)).toBe(true)
      // Whoever git resolves — this machine's developer, or the platform where there is nobody.
      expect(info?.authorName).toBe(
        execFileSync('git', ['config', '--get', 'user.name'], { cwd: root }).toString().trim()
      )
      expect(info?.authorEmail).not.toBe('')
      expect(Number.isNaN(Date.parse(info?.committedAt ?? ''))).toBe(false)
    })

    test.skipIf(!ISOLATABLE)('a machine with no identity at all gets the platform\'s', async () => {
      // The other half of the rule: an identity is written only where there is none to inherit,
      // so a project on a fresh machine still produces commits that name an author.
      const root = await sandbox({ 'a.txt': 'one' })
      const saved = {
        global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_SYSTEM,
      }
      process.env.GIT_CONFIG_GLOBAL = '/dev/null'
      process.env.GIT_CONFIG_SYSTEM = '/dev/null'
      try {
        await run(root, SlotGitCommand.Ensure)

        expect(
          execFileSync('git', ['config', '--local', '--get', 'user.name'], { cwd: root })
            .toString().trim()
        ).toBe('OwlMeans Viable')
      } finally {
        restoreEnv('GIT_CONFIG_GLOBAL', saved.global)
        restoreEnv('GIT_CONFIG_SYSTEM', saved.system)
      }
    })

    test('status reports the working tree, its head and no remote', async () => {
      const root = await sandbox({ 'a.txt': 'one' })
      await commit(root, 'chore: initial')

      const clean = await status(root)
      expect(clean.dirty).toBe(false)
      expect(clean.changedFiles).toBe(0)
      expect(clean.head?.subject).toBe('chore: initial')
      expect(clean.remoteUrl).toBeNull()
      expect(clean.ahead).toBeNull()
      expect(clean.behind).toBeNull()

      await fse.writeFile(path.join(root, 'a.txt'), 'two')
      await fse.writeFile(path.join(root, 'b.txt'), 'new')

      const dirty = await status(root)
      expect(dirty.dirty).toBe(true)
      expect(dirty.changedFiles).toBe(2)
      expect(dirty.files.map(file => file.path).sort()).toEqual(['a.txt', 'b.txt'])
      expect(dirty.files.find(file => file.path === 'a.txt')?.status).toBe('M')
      expect(dirty.files.find(file => file.path === 'b.txt')?.status).toBe('??')
    })

    test('the log is newest first and bounded', async () => {
      const root = await sandbox({ 'a.txt': '1' })
      await commit(root, 'chore: one')
      await fse.writeFile(path.join(root, 'a.txt'), '2')
      await commit(root, 'chore: two')

      const { commits } = await run(root, SlotGitCommand.Log) as { commits: SlotGitCommitInfo[] }

      expect(commits.map(entry => entry.subject)).toEqual(['chore: two', 'chore: one'])
    })

    test('a subject carrying the field separator\'s neighbours still parses', async () => {
      // The log format is field-separated by \x1f precisely so a subject with tabs, spaces or
      // arrows in it does not split into the wrong columns.
      const root = await sandbox({ 'a.txt': '1' })

      const info = await commit(root, 'fix: rename a -> b\tand tidy up')

      expect(info?.subject).toBe('fix: rename a -> b\tand tidy up')
    })
  })

  describe('discard', () => {
    test('restores tracked files and removes untracked ones', async () => {
      const root = await sandbox({ 'a.txt': 'one' })
      await commit(root, 'chore: initial')
      await fse.writeFile(path.join(root, 'a.txt'), 'edited')
      await fse.writeFile(path.join(root, 'junk.txt'), 'scratch')

      const after = await run(root, SlotGitCommand.Discard) as unknown as SlotGitStatus

      expect(await fse.readFile(path.join(root, 'a.txt'), 'utf-8')).toBe('one')
      expect(await fse.pathExists(path.join(root, 'junk.txt'))).toBe(false)
      expect(after.dirty).toBe(false)
    })

    test('the connector\'s own marker directory is never swept', async () => {
      // It is untracked until someone commits it, and a discard that removed it would leave a
      // tree no later session can recognize as a platform project.
      const root = await sandbox({ 'a.txt': 'one', '.viable/connect.json': '{"slug":"orchard"}' })
      await commit(root, 'chore: initial')
      await fse.writeFile(path.join(root, '.viable/connect.json'), '{"slug":"orchard"}')

      await run(root, SlotGitCommand.Discard)

      expect(await fse.pathExists(path.join(root, '.viable/connect.json'))).toBe(true)
    })

    test('an unborn branch is reported rather than reset', async () => {
      const root = await sandbox({ 'a.txt': 'one' })

      const state = await run(root, SlotGitCommand.Discard) as unknown as SlotGitStatus

      expect(state.head).toBeNull()
      expect(await fse.pathExists(path.join(root, 'a.txt'))).toBe(true)
    })
  })

  describe('revertTo', () => {
    test('appends a commit restoring the old content, leaving the history intact', async () => {
      const root = await sandbox({ 'a.txt': 'one' })
      const first = await commit(root, 'chore: one')
      await fse.writeFile(path.join(root, 'a.txt'), 'two')
      const second = await commit(root, 'chore: two')

      const { commit: reverted } = await run(
        root, SlotGitCommand.RevertTo, { hash: first?.hash }
      ) as { commit: SlotGitCommitInfo }

      expect(await fse.readFile(path.join(root, 'a.txt'), 'utf-8')).toBe('one')
      expect(reverted.subject).toContain('revert: restore')
      // Nothing that happened was unmade: both earlier commits are still reachable, and the
      // revert is a THIRD one on top of them.
      const { commits } = await run(root, SlotGitCommand.Log) as { commits: SlotGitCommitInfo[] }
      expect(commits).toHaveLength(3)
      expect(commits.map(entry => entry.hash)).toContain(second?.hash ?? '')
      expect(commits.map(entry => entry.hash)).toContain(first?.hash ?? '')
    })

    test('a dirty tree is refused, because the revert would overwrite it', async () => {
      const root = await sandbox({ 'a.txt': 'one' })
      const first = await commit(root, 'chore: one')
      await fse.writeFile(path.join(root, 'a.txt'), 'uncommitted work')

      expect(run(root, SlotGitCommand.RevertTo, { hash: first?.hash }))
        .rejects.toThrow(GitDirtyTree)
    })

    test('an unknown hash is refused by name', async () => {
      const root = await sandbox({ 'a.txt': 'one' })
      await commit(root, 'chore: one')

      expect(run(root, SlotGitCommand.RevertTo, { hash: 'deadbeef' }))
        .rejects.toThrow(/invalid-hash:deadbeef/)
    })

    test('reverting to what HEAD already holds adds nothing', async () => {
      const root = await sandbox({ 'a.txt': 'one' })
      const head = await commit(root, 'chore: one')

      const { commit: answered } = await run(
        root, SlotGitCommand.RevertTo, { hash: head?.hash }
      ) as { commit: SlotGitCommitInfo }

      expect(answered.hash).toBe(head?.hash ?? '')
      const { commits } = await run(root, SlotGitCommand.Log) as { commits: SlotGitCommitInfo[] }
      expect(commits).toHaveLength(1)
    })
  })

  describe('remotes', () => {
    test('push, pull and setRemote refuse as text rather than throwing', async () => {
      // A caller that received a throw would retry something that can never succeed. This is a
      // policy — a local repository's remotes belong to the person who owns the directory.
      const root = await sandbox({ 'a.txt': 'one' })
      await commit(root, 'chore: one')

      for (const command of [
        SlotGitCommand.Push, SlotGitCommand.Pull, SlotGitCommand.SetRemote
      ]) {
        const answer = await run(root, command, { token: 'never-used', remoteUrl: 'https://github.com/o/r' })
        expect(typeof answer.result).toBe('string')
        expect(answer.result as string).toContain('your own machine')
        // The GitSyncResult fields travel beside it so a caller reading that shape finds them.
        expect(answer.status).toBe('no-remote')
        expect(answer.ahead).toBeNull()
      }

      // And nothing was configured behind the refusal.
      expect((await status(root)).remoteUrl).toBeNull()
    })
  })

  describe('serialization', () => {
    test('concurrent commands do not collide over the repository lock', async () => {
      // Git takes `.git/*.lock` for the duration of a write, and every command here calls
      // `ensure` first — two unsynchronized producers fail with "could not lock config file".
      const root = await sandbox({ 'a.txt': 'one' })

      const answers = await Promise.all([
        run(root, SlotGitCommand.Ensure),
        status(root),
        run(root, SlotGitCommand.Log),
        status(root),
        run(root, SlotGitCommand.Ensure),
      ])

      expect(answers).toHaveLength(5)
      expect((answers[1] as unknown as SlotGitStatus).branch).toBe('main')
    })
  })
})
