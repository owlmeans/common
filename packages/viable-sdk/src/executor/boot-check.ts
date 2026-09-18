import { spawn as nodeSpawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'

import { readTargetHealth } from './health.js'
import type { TargetHealthReading } from './health.js'
import { delay, killGroupAndWait, reclaimPort, waitForPortFree } from './spawn.js'

/**
 * Boot the generated backend for real, in isolation, and report what happened.
 *
 * `tsc` cannot see a foreign key that names a resource nothing registers: the reference is a
 * string in an AJV schema, and it is resolved while the OwlMeans context initializes. So a story
 * can type-check, be stamped complete, and leave a backend that dies at boot — which is exactly
 * what happened, because the only real boot in the pipeline ran AFTER the story was accepted.
 *
 * It runs the real thing, but never the live one: a second process, on its own port, against a
 * scratch schema, killed on every exit path.
 */

/** How far the boot got. `ready` is the only success. */
export type BootCheckPhase = 'build' | 'schema' | 'boot' | 'ready'

export interface BootCheckReport {
  ok: boolean
  phase: BootCheckPhase
  /** The classifier's reason plus the captured startup log, or null when the boot succeeded. */
  error: string | null
  dbOk?: boolean
}

export interface BootCheckDeps {
  port: number
  /** Argv marker that tells this instance apart from the live one for process matching. */
  marker: string
  cwd: string
  env: Record<string, string>
  bootId: string
  /** Omitted to reuse the artifacts already on disk. */
  build?: () => Promise<string | null>
  readHealth?: (port: number, bootId: string, timeoutMs: number) => Promise<TargetHealthReading>
  spawn?: typeof nodeSpawn
  ddlWindowMs?: number
  readyWindowMs?: number
  readyPollMs?: number
  /** Whole-run cap, so a wedged boot cannot outlive the caller's deadline. */
  timeoutMs?: number
}

const STARTUP_LOG_CAP = 16_384

/**
 * DELIBERATE DIFFERENCE from the publisher: no `resetSchema` step, and therefore no `schema`
 * failure of its own.
 *
 * A slot's check drops and recreates its scratch schema as the application role, which owns it. On
 * a developer's machine the database is the DEVELOPER'S — the connector was handed a `DATABASE_URL`
 * and nothing above it, it has no credential that may drop anything, and a platform that silently
 * dropped a schema in a database it does not own would be destroying work it cannot restore. The
 * check still runs under `DATABASE_SCHEMA=bootcheck`, so it never touches the app's namespace; it
 * simply leaves what it created behind, and the next run reconciles into it.
 */
export const runBootCheck = async (deps: BootCheckDeps): Promise<BootCheckReport> => {
  const {
    port, marker, cwd, env, bootId, build,
    readHealth = readTargetHealth,
    spawn = nodeSpawn,
    ddlWindowMs = 10_000,
    readyWindowMs = 90_000,
    readyPollMs = 2_000,
    timeoutMs = 480_000,
  } = deps

  const deadline = Date.now() + timeoutMs
  let child: ChildProcess | null = null
  let log = ''
  const record = (chunk: string): void => {
    log = (log + chunk).slice(-STARTUP_LOG_CAP)
  }

  try {
    if (build != null) {
      const buildError = await build()
      if (buildError != null) return { ok: false, phase: 'build', error: buildError }
    }

    // Before the spawn, not only after it. The leftover this reclaims belongs to a run that never
    // finished, so it is already holding the port by the time anything asks for a fresh check —
    // and the target refuses to start on a taken port rather than stealing it, correctly.
    if (!await waitForPortFree(port, 2_000)) await reclaimPort(port, marker)

    child = spawn('bun', ['dist/index.js', marker], {
      cwd,
      detached: true,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env, BACKEND_BOOT_ID: bootId },
    })
    child.stdout?.on('data', chunk => record(chunk.toString()))
    child.stderr?.on('data', chunk => record(chunk.toString()))

    let exited = false
    child.on('exit', () => { exited = true })
    child.on('error', error => record(`\n${String(error)}`))

    // A structure or reference error takes the target down during init; that is what this window
    // is for. A target that survives it may still be degraded, which is what the poll asks about.
    const ddlDeadline = Date.now() + ddlWindowMs
    while (Date.now() < ddlDeadline && !exited) {
      await delay(200)
    }
    if (exited) {
      return { ok: false, phase: 'boot', error: `The target backend exited while initializing:\n${log}` }
    }

    const readyDeadline = Math.min(Date.now() + readyWindowMs, deadline)
    let reason = 'The target backend did not become ready'
    while (Date.now() < readyDeadline) {
      if (exited) {
        return { ok: false, phase: 'boot', error: `The target backend exited while initializing:\n${log}` }
      }
      const health = await readHealth(port, bootId, 2_000)
      if (health.ready) return { ok: true, phase: 'ready', error: null, dbOk: health.dbOk }
      reason = health.reason
      // A self-reported failure is terminal — no point waiting out the window for a target that
      // has already said it will not come up.
      if (health.terminal) {
        return { ok: false, phase: 'boot', error: `${reason}\n${log}`.trim(), dbOk: health.dbOk }
      }
      await delay(readyPollMs)
    }

    return { ok: false, phase: 'boot', error: `${reason}\n${log}`.trim() }
  } catch (e) {
    return { ok: false, phase: 'boot', error: `Boot check failed to run: ${String(e)}\n${log}`.trim() }
  } finally {
    // Unconditional: a validation instance left holding its port would fail every later check,
    // and one left holding the database would be indistinguishable from the live backend.
    if (child != null) {
      try {
        await killGroupAndWait(child)
      } catch {
        // Already gone.
      }
    }
    try {
      // Reclaimed by MARKER when waiting is not enough: a connector killed mid-check leaves its
      // detached child alive, and every later check then fails with the target's own "the api port
      // is already in use" — which reads as a defect in the generated app rather than as a stray
      // process from a run that never finished.
      if (!await waitForPortFree(port)) await reclaimPort(port, marker)
    } catch {
      // Nothing else to do — the next check reclaims by marker anyway.
    }
  }
}

export interface BootCheckStatus {
  running: boolean
  startedAt: number | null
  report: BootCheckReport | null
}

export interface BootCheckJob {
  /** Start a check, or join the one already running. `true` when this call started it. */
  start: (run: () => Promise<BootCheckReport>) => boolean
  status: () => BootCheckStatus
  /** The running check, for the legacy blocking caller. */
  pending: () => Promise<BootCheckReport> | null
}

/**
 * Outer bound on one boot-check job.
 *
 * `runBootCheck` caps its own ready poll but not the build in front of it, so this is the only
 * thing that guarantees a poller eventually reads `running: false` — a check that outlives it is
 * abandoned, not awaited.
 */
const WATCHDOG_MS = 600_000

/**
 * The job behind `BootCheck` / `BootCheckStatus`.
 *
 * The command STARTS a check and returns; the verdict is read separately. A boot is minutes of
 * build and startup, and holding one request open for it made a fault indistinguishable from a
 * hung agent for the whole of the caller's timeout. A second start joins the running check rather
 * than spawning another instance onto the same port.
 */
export const createBootCheckJob = (watchdogMs = WATCHDOG_MS): BootCheckJob => {
  let promise: Promise<BootCheckReport> | null = null
  let startedAt: number | null = null
  let last: BootCheckReport | null = null

  return {
    start: run => {
      if (promise != null) return false

      startedAt = Date.now()
      const job = run()
      promise = job

      // The job owns its own completion: the starting request is already gone by then, so the
      // report has to be parked where a status read can find it. A throw is a report too — a
      // poller that never sees `running: false` waits out its whole deadline for nothing.
      void job.then(
        report => { last = report },
        e => {
          last = { ok: false, phase: 'boot', error: `Boot check failed to run: ${String(e)}` }
        },
      ).finally(() => {
        if (promise === job) promise = null
      })

      const watchdog = setTimeout(() => {
        if (promise !== job) return
        promise = null
        last = {
          ok: false, phase: 'boot',
          error: `Boot check exceeded ${watchdogMs}ms and was abandoned`,
        }
      }, watchdogMs)
      watchdog.unref?.()
      void job.finally(() => clearTimeout(watchdog))

      return true
    },

    status: () => ({ running: promise != null, startedAt, report: last }),

    pending: () => promise,
  }
}
