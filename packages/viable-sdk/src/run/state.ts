import fs from 'fs-extra'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import p from 'node:path'

import {
  CONNECT_MARKER_DIR, CONNECT_RUN_FILE, TARGET_API_MARKER, TARGET_API_PORT, TARGET_WEB_PORT,
  TARGET_WORKER_MARKER,
  TARGET_WORKER_PORT
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
    env: Record<string, string> = {}
  ): Promise<LocalProcessRecord> => {
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

  const restartApi = async (): Promise<string | null> => {
    const record = await readRun()
    if (record == null || record.api == null) return null

    const refused = await integrityHelper.integrityRefusal(dir, 'Refused to restart')
    if (refused != null) return refused

    await runProcessHelper.stopProcess(record.api)
    const api = await startApi()
    await writeRun({ ...record, api })

    return null
  }

  return { readRun, writeRun, clearRun, startApi, startWorker, restartApi }
}
