import fs from 'fs-extra'
import p from 'node:path'

import {
  SlotCommandType, SlotShellCommand, TARGET_API_PORT, TARGET_WEB_PORT, TARGET_WORKER_PORT
} from '@owlmeans/viable-common'
import type { SlotShellResult } from '@owlmeans/viable-common'

import { makeLocalSlotExecutor } from '../executor/index.js'
import { readTargetHealth } from '../executor/health.js'
import { integrityRefusal } from '../executor/integrity.js'
import { apiPath, webPath } from '../executor/layout.js'
import { isAlive } from '../executor/spawn.js'
import { createLocalServer } from './serve.js'
import type { LocalServer } from './serve.js'
import {
  apiRunning, clearRun, readRun, startApi, startWorker, stopProcess, writeRun
} from './state.js'
import type { LocalRunRecord } from './state.js'

export * from './state.js'
export * from './serve.js'

/**
 * Run the generated application on the developer's own machine.
 *
 * The slot's equivalent is a pod: a publisher supervising two children and a static server, with
 * Kubernetes underneath. None of that exists here, and the parts that were about the pod are
 * deliberately not reproduced — there is no respawn ladder, no reconciler and no health route,
 * because a developer watching their own terminal is the supervisor. What IS reproduced is the
 * shape: the same ports, the same argv marker, the same environment, and the same "port ownership
 * is the only proof" rule about restarts.
 */

/** Servers this process is holding, so a stop can close what a run opened. */
const _servers = new Map<string, LocalServer>()

export interface RunLocalOptions {
  /** Build before starting. On by default — starting a stale `dist/` is the confusing failure. */
  build?: boolean
  log?: (line: string) => void
}

export interface RunLocalResult {
  record: LocalRunRecord | null
  /**
   * The ports the run uses, so a caller can print an address without composing one.
   *
   * Stated even when a process did not come up: they are where the app WILL answer, and whether
   * it does yet is what `error`, `buildError` and {@link localStatus} are for.
   */
  api: number
  web: number
  worker?: number
  /** The reason nothing was started, or the tree was refused. */
  error?: string
  /** A build ran and failed. The web server still comes up so the state is visible. */
  buildError?: string
}

/** One supervised process, as a status read finds it. */
export interface LocalProcessStatus {
  pid: number
  port: number
  alive: boolean
}

export interface LocalRunStatus {
  running: boolean
  startedAt?: string
  /** Ports, flat, for a caller composing an address or a one-line report. */
  api?: number
  worker?: number
  web?: number
  /** The target's own boot phase, when it got far enough to report one. */
  phase?: string
  /** Whether the target says it is serving — never the same question as "the pid is alive". */
  ready?: boolean
  /** Why it is not ready. Absent when it is. */
  reason?: string
  processes: {
    api?: LocalProcessStatus
    worker?: LocalProcessStatus
    web?: LocalProcessStatus
  }
}

/**
 * Build the target, start its processes, serve its browser app.
 *
 * A previous run is stopped first: both halves bind fixed ports, and a replacement that races the
 * process it is replacing loses the bind and exits — with nothing announcing it, since a failed
 * `listen` says nothing on its own.
 */
export const runLocal = async (
  dir: string, options: RunLocalOptions = {}
): Promise<RunLocalResult> => {
  const root = p.resolve(dir)
  const log = options.log ?? (() => undefined)

  const ports = { api: TARGET_API_PORT, web: TARGET_WEB_PORT }

  const refused = await integrityRefusal(root, 'Refused to run')
  if (refused != null) {
    return { record: null, ...ports, error: refused }
  }

  await stopLocal(root)

  let buildError: string | undefined
  if (options.build !== false) {
    log('Building the target project…')
    const result = await makeLocalSlotExecutor(root, { log }).execute({
      type: SlotCommandType.Shell, command: SlotShellCommand.Build,
    }) as SlotShellResult
    if (result.result != null) {
      buildError = result.result
    }
  }

  const record: LocalRunRecord = { dir: root, startedAt: new Date().toISOString() }

  // Only when the last build left something to spawn. Starting `bun dist/index.js` against a
  // missing bundle fails with a message about a file rather than about the build that never
  // produced it.
  if (await fs.pathExists(p.resolve(apiPath(root), 'dist', 'index.js'))) {
    record.api = await startApi(root)
    log(`Target api started on port ${record.api.port}`)
  } else {
    buildError ??= 'The target api has no build output — nothing was started.'
  }

  const worker = await startWorker(root)
  if (worker != null) {
    record.worker = worker
    log(`Target worker started on port ${worker.port}`)
  }

  const server = createLocalServer(
    () => p.resolve(webPath(root), 'dist'), { apiPort: TARGET_API_PORT }
  )
  await server.listen(TARGET_WEB_PORT)
  _servers.set(root, server)
  // The web server is this process, not a child: whoever called `runLocal` is holding it, and its
  // pid is what a later `localStatus` from another process checks for liveness.
  record.web = { pid: process.pid, port: TARGET_WEB_PORT }
  log(`Target app served at http://localhost:${TARGET_WEB_PORT}`)

  await writeRun(root, record)

  return {
    record,
    ...ports,
    ...(worker != null ? { worker: worker.port } : {}),
    ...(buildError != null ? { buildError } : {}),
  }
}

/**
 * Stop whatever the run record names, and forget it.
 *
 * Safe to call when nothing is running: the record is the only authority, and a stale one names
 * pids that are simply not alive. The children are detached, so they outlive the process that
 * started them — which is exactly why the record is a file and this is the only way to end them.
 */
export const stopLocal = async (dir: string): Promise<void> => {
  const root = p.resolve(dir)

  const server = _servers.get(root)
  if (server != null) {
    _servers.delete(root)
    await server.close()
  }

  const record = await readRun(root)
  if (record == null) return

  await stopProcess(record.worker)
  await stopProcess(record.api)
  await clearRun(root)
}

/**
 * What is running, and whether the target is actually serving.
 *
 * Two independent facts, because either one alone lies. A live pid says nothing about a target
 * that bound its port and then failed to reach its database — it answers `200` with `db.ok:false`
 * and would otherwise read as healthy. A health answer says nothing about a process that died
 * while something else holds the port.
 */
export const localStatus = async (dir: string): Promise<LocalRunStatus> => {
  const root = p.resolve(dir)
  const record = await readRun(root)
  if (record == null) {
    return { running: false, processes: {} }
  }

  const status: LocalRunStatus = {
    running: apiRunning(record),
    startedAt: record.startedAt,
    processes: {},
  }

  if (record.api != null) {
    const port = record.api.port ?? TARGET_API_PORT
    const health = await readTargetHealth(port, record.api.bootId ?? '', 2_000)
    status.api = port
    status.ready = health.ready
    if (health.phase != null) status.phase = health.phase
    if (!health.ready) status.reason = health.reason
    status.processes.api = {
      pid: record.api.pid, port, alive: isAlive(record.api.pid),
    }
  }

  if (record.worker != null) {
    const port = record.worker.port ?? TARGET_WORKER_PORT
    status.worker = port
    status.processes.worker = {
      pid: record.worker.pid, port, alive: isAlive(record.worker.pid),
    }
  }

  if (record.web != null) {
    status.web = record.web.port
    status.processes.web = {
      pid: record.web.pid, port: record.web.port, alive: isAlive(record.web.pid),
    }
  }

  return status
}
