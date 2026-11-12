import fs from 'fs-extra'
import p from 'node:path'

import {
  MAIN_APP, SlotCommandType, SlotShellCommand, TARGET_API_PORT, TARGET_WEB_PORT, TARGET_WORKER_PORT, appMapHelper,
  type AppDescriptor, type SlotShellResult,
} from '@owlmeans/viable-common'

import { makeLocalSlotExecutor } from '../executor/index.js'
import { healthHelper } from '../executor/health.js'
import { integrityHelper } from '../executor/integrity.js'
import { makeLayoutHelper } from '../executor/layout.js'
import { spawnHelper } from '../executor/spawn.js'
import { createLocalServer } from './serve.js'
import { runProcessHelper } from './process.js'
import { makeRunStateHelper } from './state.js'
import type {
  LocalAppAddress, LocalAppStatus, LocalServer, LocalRunApp, LocalRunRecord, LocalRunStatus, RunLocalOptions, RunLocalResult,
} from './types.js'
import type { LocalRunHelper } from './local/types.js'

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

export const makeLocalRunHelper = (dir: string): LocalRunHelper => {
  const root = p.resolve(dir)
  const layout = makeLayoutHelper(root)
  const state = makeRunStateHelper(root)

  /** Where one app answers on the one local web port: `/` for main, `/<mount>/` for another. */
  const addressOf = (app: { name: string, mount: string, index: number }): LocalAppAddress => ({
    name: app.name,
    mount: app.mount,
    url: `http://localhost:${TARGET_WEB_PORT}/${app.mount === '' ? '' : `${app.mount}/`}`,
    api: appMapHelper.apiPort(app),
  })

  const runLocal = async (options: RunLocalOptions = {}): Promise<RunLocalResult> => {
    const log = options.log ?? (() => undefined)

    const ports = { api: TARGET_API_PORT, web: TARGET_WEB_PORT }

    const refused = await integrityHelper.integrityRefusal(root, 'Refused to run')
    if (refused != null) {
      return { record: null, ...ports, error: refused }
    }

    await stopLocal()

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
    if (await fs.pathExists(p.resolve(layout.apiPath(), 'dist', 'index.js'))) {
      record.api = await state.startApi()
      log(`Target api started on port ${record.api.port}`)
    } else {
      buildError ??= 'The target api has no build output — nothing was started.'
    }

    // A split project: every other app's api beside main's, each on its own port; a one-app tree
    // (no topology record, or main alone) starts nothing more and records no app list.
    const apps: AppDescriptor[] = layout.apps()
    const split = apps.length > 1
    if (split) {
      const started: LocalRunApp[] = []
      for (const app of apps) {
        const claim = { name: app.name, mount: app.mount, index: app.index }
        if (app.name === MAIN_APP) {
          started.push({ ...claim, ...(record.api != null ? { api: record.api } : {}) })
          continue
        }
        if (!await fs.pathExists(p.resolve(layout.apiPath(app.name), 'dist', 'index.js'))) {
          buildError = [buildError, `The ${app.name} api has no build output — it was not started.`]
            .filter(line => line != null).join('\n')
          started.push(claim)
          continue
        }
        const api = await state.startApi({}, claim)
        started.push({ ...claim, api })
        log(`Target ${app.name} api started on port ${api.port}`)
      }
      record.apps = started
    }

    const worker = await state.startWorker()
    if (worker != null) {
      record.worker = worker
      log(`Target worker started on port ${worker.port}`)
    }

    const server = createLocalServer(
      () => p.resolve(layout.webPath(), 'dist'), {
        apiPort: TARGET_API_PORT,
        ...(split
          ? {
            apps: apps.map(app => ({
              name: app.name,
              mount: app.mount,
              apiPort: appMapHelper.apiPort(app),
              webDir: () => p.resolve(layout.webPath(app.name), 'dist'),
            })),
          }
          : {}),
      }
    )
    await server.listen(TARGET_WEB_PORT)
    _servers.set(root, server)
    // The web server is this process, not a child: whoever called `runLocal` is holding it, and its
    // pid is what a later `localStatus` from another process checks for liveness.
    record.web = { pid: process.pid, port: TARGET_WEB_PORT }
    log(`Target app served at http://localhost:${TARGET_WEB_PORT}`)

    await state.writeRun(record)

    return {
      record,
      ...ports,
      ...(worker != null ? { worker: worker.port } : {}),
      ...(buildError != null ? { buildError } : {}),
      ...(split ? { apps: apps.map(addressOf) } : {}),
    }
  }

  const stopLocal = async (): Promise<void> => {
    const server = _servers.get(root)
    if (server != null) {
      _servers.delete(root)
      await server.close()
    }

    const record = await state.readRun()
    if (record == null) return

    await runProcessHelper.stopProcess(record.worker)
    for (const app of record.apps ?? []) {
      // main's is `record.api`, stopped below.
      if (app.name !== MAIN_APP) await runProcessHelper.stopProcess(app.api)
    }
    await runProcessHelper.stopProcess(record.api)
    await state.clearRun()
  }

  /** One app of a split run, as its own api answers. */
  const appStatus = async (app: LocalRunApp): Promise<LocalAppStatus> => {
    const address = addressOf(app)
    if (app.api == null) {
      return { ...address, alive: false, ready: false, reason: 'not started — its api had no build output' }
    }
    const health = await healthHelper.readTargetHealth(
      app.api.port, app.api.bootId ?? '', 2_000, { path: appMapHelper.healthPath(app) },
    )

    return {
      ...address,
      api: app.api.port,
      alive: spawnHelper.isAlive(app.api.pid),
      ready: health.ready,
      ...(health.phase != null ? { phase: health.phase } : {}),
      ...(!health.ready ? { reason: health.reason } : {}),
    }
  }

  const localStatus = async (): Promise<LocalRunStatus> => {
    const record = await state.readRun()
    if (record == null) {
      return { running: false, processes: {} }
    }

    const status: LocalRunStatus = {
      running: runProcessHelper.apiRunning(record),
      startedAt: record.startedAt,
      processes: {},
    }

    if (record.api != null) {
      const port = record.api.port ?? TARGET_API_PORT
      const health = await healthHelper.readTargetHealth(port, record.api.bootId ?? '', 2_000)
      status.api = port
      status.ready = health.ready
      if (health.phase != null) status.phase = health.phase
      if (!health.ready) status.reason = health.reason
      status.processes.api = {
        pid: record.api.pid, port, alive: spawnHelper.isAlive(record.api.pid),
      }
    }

    if (record.worker != null) {
      const port = record.worker.port ?? TARGET_WORKER_PORT
      status.worker = port
      status.processes.worker = {
        pid: record.worker.pid, port, alive: spawnHelper.isAlive(record.worker.pid),
      }
    }

    if (record.web != null) {
      status.web = record.web.port
      status.processes.web = {
        pid: record.web.pid, port: record.web.port, alive: spawnHelper.isAlive(record.web.pid),
      }
    }

    if (record.apps != null && record.apps.length > 0) {
      status.apps = await Promise.all(record.apps.map(appStatus))
    }

    return status
  }

  return { runLocal, stopLocal, localStatus }
}
