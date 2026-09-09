import fs from 'fs-extra'
import { randomUUID } from 'node:crypto'
import p from 'node:path'

import {
  formatIntegrityReport, SubProject, TARGET_BOOTCHECK_MARKER, TARGET_BOOTCHECK_PORT,
  TARGET_BOOTCHECK_SCHEMA
} from '@owlmeans/viable-common'
import type { SlotShellResult } from '@owlmeans/viable-common'

import { probePort, readEnvFile, ROOT_ENV_FILE, serviceEndpoint } from '../project/env.js'
import { restartApi } from '../run/state.js'
import { createBootCheckJob, runBootCheck } from './boot-check.js'
import type { BootCheckJob, BootCheckReport, BootCheckStatus } from './boot-check.js'
import { backendEnv, frontendEnv } from './env.js'
import type { LocalFileHelper } from './files.js'
import { verifyTarget } from './integrity.js'
import { apiPath, hasWorker, libraryPaths, webPath, workerPath } from './layout.js'
import { runCommand, runScript } from './spawn.js'

/**
 * The shell half of the local executor — every `SlotShellCommand`, against a directory.
 *
 * The contract every method answers with is the publisher's: **error text, or `null` for
 * success**. It is not a transcript — a command that fails returns the diagnostics a fixer or a
 * person can act on, and a command that succeeds returns nothing at all.
 */

/**
 * The one reason a script refuses that is NOT a verdict about the code.
 *
 * A build with nothing to build on is an ordinary no-op that the next trigger repeats correctly —
 * it happens between attaching to a fresh clone and the first install. It must not be reported as
 * a failed build, or the connector announces broken code during a window in which nothing was
 * even attempted.
 */
export const NOT_INSTALLED_REASON = "cannot run: the target's dependencies are not installed yet"

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

export const createLocalShellHelper = (fileHelper: LocalFileHelper, subproject?: SubProject) => {
  const root = p.resolve(fileHelper.getRootPath())

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
    const report = await verifyTarget(root)

    return report.ok
      ? null
      : `${prefix}: the project in this directory is not a Viable application\n`
        + formatIntegrityReport(report)
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

    return await runScript(script, cwd, env)
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
    for (const cwd of libraryPaths(root)) {
      const error = await runTargetScript('build', cwd)
      if (error != null) {
        return error
      }
    }

    return null
  }

  const buildWorker = async (): Promise<string | null> => {
    const dir = workerPath(root)
    if (dir == null || !hasWorker(root)) {
      return null
    }

    return await runTargetScript('build', dir)
  }

  const helper = {
    bun: async (args?: string, options?: { subproject?: SubProject }): Promise<string | null> => {
      const refused = await refusal()
      if (refused != null) return refused

      const cmd = `bun ${args ?? 'install'}`

      return await runCommand(cmd, { cwd: fileHelper.getRootPath(options?.subproject ?? subproject) })
    },

    /**
     * Throw the lockfile away and install again.
     *
     * The truncate is the point. `bun install` on its own reproduces whatever the lockfile says,
     * and a target's lockfile was written the day the project was created — so a framework
     * package republished afterwards is invisible to it no matter how often the target is
     * rebuilt. Emptied rather than deleted, matching initialization: bun reads an empty file as
     * "no lockfile", so a failed install leaves a state the next attempt resolves cleanly instead
     * of one where a stale lock has come back.
     */
    reinstall: async (): Promise<string | null> => {
      const refused = await refusal()
      if (refused != null) return refused

      try {
        await fs.writeFile(p.join(root, 'bun.lock'), '')
      } catch {
        // No lockfile to clear is not a failure — a tree may predate one, or have had it removed.
      }

      return await runCommand('bun install', { cwd: root })
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

      // The diagnostics are on stdout; `tsc`'s stderr is about the compiler, not about the code.
      return await runCommand('bunx tsc --noEmit', {
        cwd: fileHelper.getRootPath(subprojectOverride ?? subproject),
        stdoutOnly: true,
      })
    },

    /** The buildability check for the UI: the browser bundle really built, or the reason it did not. */
    validateWithRenderer: async (): Promise<string | null> =>
      await buildLibraries() ?? await runTargetScript('build', webPath(root), await frontendEnv(root)),

    /**
     * Rebuild the whole target, in dependency order.
     *
     * The libraries first, because everything else resolves them from `node_modules` at RUN time
     * and follows each to its `build/index.js` — a bundle built before them starts with
     * `Cannot find package '<slug>-backend'`, a message about a dependency for a build that never
     * happened. The remaining three are independent, so all of them run and their problems are
     * reported together rather than one round trip at a time.
     */
    build: async (): Promise<string | null> => {
      const libraries = await buildLibraries()
      if (libraries != null) {
        return libraries
      }

      const errors = [
        await runTargetScript('build', apiPath(root)),
        await buildWorker(),
        await runTargetScript('build', webPath(root), await frontendEnv(root)),
      ].filter((error): error is string => error != null)

      return errors.length > 0 ? errors.join('\n') : null
    },

    /** Build the api only — the type check the frontend renderer build cannot give it. */
    validateBackend: async (): Promise<string | null> =>
      await buildLibraries() ?? await runTargetScript('build', apiPath(root)),

    /**
     * Reconcile the target's database with its code.
     *
     * The target owns its own structure: every `@owlmeans/postgres` resource creates and updates
     * its table while the context initializes. So a sync is not a command run against the source
     * tree — it is *check that the database is there, then restart the backend* — and there is
     * nothing to generate and no migration file to apply.
     *
     * A local target's database is the developer's. The platform provisions none, so an absent
     * URL is reported by NAME rather than repaired: it is a line the person has to write, and
     * "database unavailable" would send them looking at a server instead.
     */
    dbSync: async (): Promise<string | null> => {
      const values = await readEnvFile(root, ROOT_ENV_FILE)
      const url = values.DATABASE_URL ?? ''
      if (url === '') {
        return `DATABASE_URL is not set in ${ROOT_ENV_FILE}. A local target uses a database on `
          + `this machine and the platform provisions none — set it and run this again.`
      }

      const endpoint = serviceEndpoint(url)
      if (endpoint == null) {
        return `DATABASE_URL in ${ROOT_ENV_FILE} is not a URL naming a host and a port.`
      }
      if (!await probePort(endpoint.host, endpoint.port)) {
        return `Nothing is listening at ${endpoint.host}:${endpoint.port} — `
          + `the database DATABASE_URL names is not reachable from this machine.`
      }

      return await restartApi(root)
    },

    /**
     * Answering, not enforcing.
     *
     * The connector refuses on its own before every spawn regardless; this exists so a caller can
     * ask BEFORE letting a merge reach a build, and report the violations to the person whose
     * repository they belong to.
     */
    integrity: async (): Promise<SlotShellResult> => {
      const report = await verifyTarget(root)

      return {
        result: report.ok ? null : formatIntegrityReport(report),
        ok: report.ok,
        violations: report.violations.map(violation => `${violation.path}: ${violation.detail}`),
      }
    },

    /**
     * Start a real boot in isolation and return at once.
     *
     * A second start joins the running check rather than spawning another instance onto the port.
     * The verdict is read with {@link bootCheckStatus}; `wait` is the legacy blocking path for a
     * caller that predates the job.
     */
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

        const values = await readEnvFile(root, ROOT_ENV_FILE)
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
          cwd: apiPath(root),
          env: {
            ...await backendEnv(root),
            BACKEND_PORT: `${TARGET_BOOTCHECK_PORT}`,
            DATABASE_SCHEMA: TARGET_BOOTCHECK_SCHEMA,
          },
          bootId: randomUUID(),
          ...(options.skipBuild === true
            ? {}
            : { build: async () => await buildLibraries() ?? await runTargetScript('build', apiPath(root)) }),
        })
      })

      if (options.wait !== true) return null

      return await job.pending() ?? job.status().report
    },

    bootCheckStatus: async (): Promise<BootCheckStatus> => jobFor(root).status(),
  }

  return helper
}

export type LocalShellHelper = ReturnType<typeof createLocalShellHelper>
