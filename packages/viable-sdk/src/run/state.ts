import fs from 'fs-extra'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import p from 'node:path'

import {
  CONNECT_MARKER_DIR, CONNECT_RUN_FILE, MAIN_APP, TARGET_API_MARKER, TARGET_API_PORT, TARGET_WEB_PORT,
  TARGET_WORKER_MARKER,
  TARGET_WORKER_PORT, appMapHelper, type SlotAppClaim,
} from '@owlmeans/viable-common'

import { makeTargetEnvHelper } from '../executor/env.js'
import { makeLayoutHelper } from '../executor/layout.js'
import { integrityHelper } from '../executor/integrity.js'
import { spawnHelper } from '../executor/spawn.js'
import { runProcessHelper } from './process.js'
import type { LocalProcessRecord, LocalRunRecord } from './types.js'
import type { RunStateHelper } from './state/types.js'

export { TARGET_API_PORT, TARGET_WEB_PORT, TARGET_WORKER_PORT }

/**
 * What a local run is, written down.
 *
 * A separate module from the run itself, and the separation is load-bearing: `DbSync` has to
 * bounce the api child, `DbSync` lives in the shell commands, and the shell commands are reached
 * through the executor the run is built on. Everything that touches a child process therefore
 * lives here, below both of them, instead of making the three import each other in a circle.
 *
 * The record is a file rather than memory because the processes outlive the call that started
 * them and, on a restarted connector, outlive the process that started them too.
 */
export const makeRunStateHelper = (dir: string): RunStateHelper => {
  const runFile = (): string => p.join(dir, CONNECT_RUN_FILE)

  const readRun = async (): Promise<LocalRunRecord | null> => {
    const content = await fs.readFile(runFile(), 'utf-8').catch(() => null)
    if (content == null) return null

    try {
      const parsed: unknown = JSON.parse(content)

      return typeof parsed === 'object' && parsed !== null ? parsed as LocalRunRecord : null
    } catch {
      return null
    }
  }

  const writeRun = async (record: LocalRunRecord): Promise<void> => {
    await fs.ensureDir(p.join(dir, CONNECT_MARKER_DIR))
    await fs.writeFile(runFile(), `${JSON.stringify(record, null, 2)}\n`)
  }

  const clearRun = async (): Promise<void> => {
    await fs.rm(runFile(), { force: true }).catch(() => undefined)
  }

  const startApi = async (
    env: Record<string, string> = {}, app?: SlotAppClaim
  ): Promise<LocalProcessRecord> => {
    if (app != null && app.name !== MAIN_APP) return await startAppApi(app, env)
    const bootId = randomUUID()
    const cwd = makeLayoutHelper(dir).apiPath()
    // A run killed without a stop leaves this child alive — detaching it is what keeps it
    // running after the tool that started it exits. What survives holds the port, and the
    // replacement then loses the bind and exits without announcing it.
    if (!await spawnHelper.waitForPortFree(TARGET_API_PORT, 2_000)) {
      await spawnHelper.reclaimPort(TARGET_API_PORT, TARGET_API_MARKER)
    }

    const child = spawn('bun', ['dist/index.js', TARGET_API_MARKER], {
      cwd,
      detached: true,
      shell: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        ...await makeTargetEnvHelper(dir).backendEnv(),
        BACKEND_PORT: `${TARGET_API_PORT}`,
        BACKEND_BOOT_ID: bootId,
        ...env,
      },
    })
    child.unref()

    return { pid: child.pid ?? -1, port: TARGET_API_PORT, bootId }
  }

  /**
   * Another app's api: its own package, port and environment (`appMapHelper.apiEnvOf`), and its own
   * argv marker (`--viable-app=<name>`) — never main's `--viable-api`, so reclaiming main's port can
   * never take a sibling with it, and reclaiming this one takes only what carries its own marker.
   */
  const startAppApi = async (app: SlotAppClaim, env: Record<string, string>): Promise<LocalProcessRecord> => {
    const bootId = randomUUID()
    const port = appMapHelper.apiPort(app)
    const marker = appMapHelper.marker(app)!
    const cwd = makeLayoutHelper(dir).apiPath(app.name)
    if (!await spawnHelper.waitForPortFree(port, 2_000)) {
      await spawnHelper.reclaimPort(port, marker)
    }

    const child = spawn('bun', ['dist/index.js', marker], {
      cwd,
      detached: true,
      shell: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        ...await makeTargetEnvHelper(dir).backendEnv(app),
        BACKEND_BOOT_ID: bootId,
        ...env,
      },
    })
    child.unref()

    return { pid: child.pid ?? -1, port, bootId }
  }

  const startWorker = async (): Promise<LocalProcessRecord | null> => {
    const layout = makeLayoutHelper(dir)
    if (!layout.hasWorker()) return null

    const cwd = layout.workerPath()
    if (cwd == null) return null

    const bootId = randomUUID()
    const child = spawn('bun', ['dist/index.js', TARGET_WORKER_MARKER], {
      cwd,
      detached: true,
      shell: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        ...await makeTargetEnvHelper(dir).backendEnv(),
        // The target reads one "port I bind" variable and the worker binds its health port with it;
        // `WORKER_PORT` travels beside it so a worker that grew its own variable finds it.
        BACKEND_PORT: `${TARGET_WORKER_PORT}`,
        WORKER_PORT: `${TARGET_WORKER_PORT}`,
        BACKEND_BOOT_ID: bootId,
      },
    })
    child.unref()

    return { pid: child.pid ?? -1, port: TARGET_WORKER_PORT, bootId }
  }

  const restartApi = async (app?: string): Promise<string | null> => {
    const record = await readRun()
    if (app != null && app !== MAIN_APP) return await restartAppApi(record, app)
    if (record == null || record.api == null) return null

    const refused = await integrityHelper.integrityRefusal(dir, 'Refused to restart')
    if (refused != null) return refused

    await runProcessHelper.stopProcess(record.api)
    const api = await startApi()
    // A split run keeps main's line of its app list in step with the record's own api.
    await writeRun({
      ...record, api,
      ...(record.apps != null ? { apps: record.apps.map(one => one.name === MAIN_APP ? { ...one, api } : one) } : {}),
    })

    return null
  }

  /** Another app's api bounced; `null` (nothing to bounce) when the run does not hold that app. */
  const restartAppApi = async (record: LocalRunRecord | null, app: string): Promise<string | null> => {
    const entry = record?.apps?.find(one => one.name === app)
    if (record == null || entry == null) return null

    const refused = await integrityHelper.integrityRefusal(dir, 'Refused to restart')
    if (refused != null) return refused

    await runProcessHelper.stopProcess(entry.api)
    const api = await startAppApi(entry, {})
    await writeRun({ ...record, apps: record.apps!.map(one => one.name === app ? { ...one, api } : one) })

    return null
  }

  return { readRun, writeRun, clearRun, startApi, startWorker, restartApi }
}
