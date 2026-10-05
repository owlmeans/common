import fs from 'fs-extra'
import { randomUUID } from 'node:crypto'
import p from 'node:path'

import { SubProject, TARGET_BOOTCHECK_MARKER, TARGET_BOOTCHECK_PORT, TARGET_BOOTCHECK_SCHEMA, type SlotShellResult, targetIntegrityHelper } from '@owlmeans/viable-common'

import { makeProjectEnvHelper } from '../project/env.js'
import { probeHelper } from '../project/probe.js'
import { ROOT_ENV_FILE } from '../project/consts.js'
import { makeRunStateHelper } from '../run/state.js'
import { createBootCheckJob, runBootCheck } from './boot-check.js'
import type { BootCheckJob, BootCheckReport, BootCheckStatus } from './types.js'
import type { LocalFileHelper } from './files/types.js'
import type { LocalShellHelper } from './shell/types.js'
import { makeTargetEnvHelper } from './env.js'
import { integrityHelper } from './integrity.js'
import { makeLayoutHelper } from './layout.js'
import { spawnHelper } from './spawn.js'
import { NOT_INSTALLED_REASON } from './consts.js'

/**
 * The shell half of the local executor — every `SlotShellCommand`, against a directory.
 *
 * The contract every method answers with is the publisher's: **error text, or `null` for
 * success**. It is not a transcript — a command that fails returns the diagnostics a fixer or a
 * person can act on, and a command that succeeds returns nothing at all.
 */

/** Whether a refusal describes the code, or merely a window in which nothing ran. */
export const isBuildVerdict = (reason: string | null): boolean =>
  reason == null || !reason.includes(NOT_INSTALLED_REASON)

/**
 * One boot-check job per directory.
 *
 * Module-level rather than per-helper because a helper is built per command: two `BootCheck`
 * calls would otherwise each start an instance onto the same port, and a `BootCheckStatus` would
 * read a job nobody had started.
 */
const _jobs = new Map<string, BootCheckJob>()

const jobFor = (dir: string): BootCheckJob => {
  const existing = _jobs.get(dir)
  if (existing != null) return existing

  const job = createBootCheckJob()
  _jobs.set(dir, job)

  return job
}

export const createLocalShellHelper = (fileHelper: LocalFileHelper, subproject?: SubProject): LocalShellHelper => {
  const root = p.resolve(fileHelper.getRootPath())
  const layout = makeLayoutHelper(root)
  const targetEnv = makeTargetEnvHelper(root)
  const projectEnv = makeProjectEnvHelper(root)

  /**
   * Refuse to run anything in a tree that is no longer the generated application.
   *
   * Every command below executes something the tree decides: `bun install` runs the lifecycle
   * hooks a `package.json` declares, and `bun run build` runs its `scripts.build`. Both are as
   * writable as any source file — by the editor, by the agent, and by a git merge — so the guard
   * belongs in front of the spawn, not in front of whichever caller was considered.
   *
   * Returned as text rather than thrown, because that is the contract every method here already
   * answers with. A caller needs no new branch to notice.
   */
  const refusal = async (prefix = 'Refused'): Promise<string | null> => {
    const report = await integrityHelper.verifyTarget(root)

    return report.ok
      ? null
      : `${prefix}: the project in this directory is not a Viable application\n`
        + targetIntegrityHelper.formatIntegrityReport(report)
  }

  /**
   * Everything that must be true before a script may be spawned, in order.
   *
   * Each check exists because the failure it replaces lies about the cause. A missing cwd is
   * reported by `posix_spawn` as `ENOENT … '/bin/sh'`, which sends every reader after a broken
   * toolchain while the real fault is an initialization that never happened. A missing
   * `node_modules/.bin` makes every `scripts.build` exit 127 with `script "build" exited with
   * code 127`, which names the script rather than the reason and reads as a broken template.
   */
  const runTargetScript = async (
    script: string, cwd: string, env?: Record<string, string>
  ): Promise<string | null> => {
    if (!await fs.pathExists(cwd)) {
      return `${script} cannot run: ${cwd} does not exist `
        + `— the target project was never initialized in this directory`
    }
    if (!await fs.pathExists(p.resolve(root, 'node_modules', '.bin'))) {
      return `${script} ${NOT_INSTALLED_REASON}`
    }

    const refused = await refusal(`${script} refused`)
    if (refused != null) return refused

    return await spawnHelper.runScript(script, cwd, env)
  }

  /**
   * Build every package this tree consumes through its `build/` output, in dependency order.
   *
   * Not a hard-coded `common`. v2 splits the shared code in two — `common` and the `backend`
   * library `api` and `worker` compile against — so a type check that built only `common` ran
   * against a stale or absent `sources/backend/build` and reported errors about the package it
   * had just failed to build. `tsc -b` is incremental, so re-running this costs a tsbuildinfo
   * read once the output is current.
   */
  const buildLibraries = async (): Promise<string | null> => {
    for (const cwd of layout.libraryPaths()) {
      const error = await runTargetScript('build', cwd)
      if (error != null) {
        // The publisher's own `buildLibraries` leaves this marker on a library build failure;
        // matching it here is what lets `anchorDiagnostics` tell a library failure apart from a
        // subsequent `validate()` on the caller's own subproject, whether the fixer ran against a
        // slot or a local connector target — both report a bare `src/...` path otherwise.
        return `${error}\nexit 1: bun run build (${p.basename(cwd)})`
      }
    }

    return null
  }

  const buildWorker = async (): Promise<string | null> => {
    const dir = layout.workerPath()
    if (dir == null || !layout.hasWorker()) {
      return null
    }

    return await runTargetScript('build', dir)
  }

  const helper: LocalShellHelper = {
    bun: async (args?: string, options?: { subproject?: SubProject }): Promise<string | null> => {
      const refused = await refusal()
      if (refused != null) return refused

      // A connector target is agent-writable. Bun's default hardlink backend makes every file in
      // node_modules share an inode with the machine cache, so an accidental dependency edit can
      // poison every later install on that machine. Copy the registry payload into the target and
      // refresh it for the initial install; this also prevents a stale development cache from
      // winning over the immutable package body named by the lockfile.
      const cmd = `bun ${args ?? 'install --force --backend=copyfile'}`

      return await spawnHelper.runCommand(cmd, { cwd: fileHelper.getRootPath(options?.subproject ?? subproject) })
    },

    reinstall: async (): Promise<string | null> => {
      const refused = await refusal()
      if (refused != null) return refused

      try {
        await fs.writeFile(p.join(root, 'bun.lock'), '')
      } catch {
        // No lockfile to clear is not a failure — a tree may predate one, or have had it removed.
      }

      return await spawnHelper.runCommand('bun install --force --backend=copyfile', { cwd: root })
    },

    buildCommon: async (): Promise<string | null> => {
      const refused = await refusal()
      if (refused != null) return refused

      return await buildLibraries()
    },

    validate: async (subprojectOverride?: SubProject): Promise<string | null> => {
      const refused = await refusal()
      if (refused != null) return refused

      const libraries = await buildLibraries()
      if (libraries != null) {
        return libraries
      }

      // The same missing-cwd trap `runTargetScript` already refuses for a build — a role a
      // recorded topology never mapped, or an empty/v1 tree — but `validate` spawns directly and
      // had no such guard, so it answered `ENOENT … '/bin/sh'` about a package that was simply
      // never there.
      const cwd = fileHelper.getRootPath(subprojectOverride ?? subproject)
      if (!await fs.pathExists(cwd)) {
        return `validate cannot run: ${cwd} does not exist — the target project was never initialized in this directory`
      }

      // The diagnostics are on stdout; `tsc`'s stderr is about the compiler, not about the code.
      // A crash or a killed process can leave `stdout` empty on failure — falsy, but not `null` —
      // and a fixer reading that as a diagnostic with nothing to repair loops on it forever.
      const result = await spawnHelper.runCommand('bunx tsc --noEmit', { cwd, stdoutOnly: true })

      return result === '' ? `validate: tsc produced no output for ${cwd}` : result
    },

    validateWithRenderer: async (): Promise<string | null> =>
      await buildLibraries() ?? await runTargetScript('build', layout.webPath(), await targetEnv.frontendEnv()),

    build: async (): Promise<string | null> => {
      const libraries = await buildLibraries()
      if (libraries != null) {
        return libraries
      }

      const errors = [
        await runTargetScript('build', layout.apiPath()),
        await buildWorker(),
        await runTargetScript('build', layout.webPath(), await targetEnv.frontendEnv()),
      ].filter((error): error is string => error != null)

      return errors.length > 0 ? errors.join('\n') : null
    },

    validateBackend: async (): Promise<string | null> =>
      await buildLibraries() ?? await runTargetScript('build', layout.apiPath()),

    dbSync: async (): Promise<string | null> => {
      const values = await projectEnv.readEnvFile(ROOT_ENV_FILE)
      const url = values.DATABASE_URL ?? ''
      if (url === '') {
        return `DATABASE_URL is not set in ${ROOT_ENV_FILE}. A local target uses a database on `
          + `this machine and the platform provisions none — set it and run this again.`
      }

      const endpoint = probeHelper.serviceEndpoint(url)
      if (endpoint == null) {
        return `DATABASE_URL in ${ROOT_ENV_FILE} is not a URL naming a host and a port.`
      }
      if (!await probeHelper.probePort(endpoint.host, endpoint.port)) {
        return `Nothing is listening at ${endpoint.host}:${endpoint.port} — `
          + `the database DATABASE_URL names is not reachable from this machine.`
      }

      return await makeRunStateHelper(root).restartApi()
    },

    integrity: async (): Promise<SlotShellResult> => {
      const report = await integrityHelper.verifyTarget(root)

      return {
        result: report.ok ? null : targetIntegrityHelper.formatIntegrityReport(report),
        ok: report.ok,
        violations: report.violations.map(violation => `${violation.path}: ${violation.detail}`),
      }
    },

    bootCheck: async (
      options: { skipBuild?: boolean, wait?: boolean } = {}
    ): Promise<BootCheckReport | null> => {
      const job = jobFor(root)

      job.start(async () => {
        // `skipBuild` reaches `dist/index.js` with no build in front of it, so the guard has to be
        // here and not only inside the build.
        const refused = await refusal('Boot check refused')
        if (refused != null) {
          return { ok: false, phase: 'build', error: refused }
        }

        const values = await projectEnv.readEnvFile(ROOT_ENV_FILE)
        if ((values.DATABASE_URL ?? '') === '') {
          // Without a database the check cannot connect, and reporting that as a boot failure
          // would blame the generated code for a target that was never configured.
          return {
            ok: false, phase: 'schema',
            error: `Boot check skipped: ${ROOT_ENV_FILE} declares no DATABASE_URL`,
          }
        }

        return await runBootCheck({
          port: TARGET_BOOTCHECK_PORT,
          marker: TARGET_BOOTCHECK_MARKER,
          cwd: layout.apiPath(),
          env: {
            ...await targetEnv.backendEnv(),
            BACKEND_PORT: `${TARGET_BOOTCHECK_PORT}`,
            DATABASE_SCHEMA: TARGET_BOOTCHECK_SCHEMA,
          },
          bootId: randomUUID(),
          ...(options.skipBuild === true
            ? {}
            : { build: async () => await buildLibraries() ?? await runTargetScript('build', layout.apiPath()) }),
        })
      })

      if (options.wait !== true) return null

      return await job.pending() ?? job.status().report
    },

    bootCheckStatus: async (): Promise<BootCheckStatus> => jobFor(root).status(),
  }

  return helper
}

