import fs from 'fs-extra'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import p from 'node:path'

import {
  CONNECT_MARKER_DIR, CONNECT_RUN_FILE, TARGET_API_MARKER, TARGET_API_PORT, TARGET_WEB_PORT,
  TARGET_WORKER_MARKER,
  TARGET_WORKER_PORT
} from '@owlmeans/viable-common'

import { backendEnv } from '../executor/env.js'
import { apiPath, hasWorker, workerPath } from '../executor/layout.js'
import { integrityRefusal } from '../executor/integrity.js'
import { isAlive, probeListening, reclaimPort, signalGroup, waitForPortFree } from '../executor/spawn.js'

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

export interface LocalProcessRecord {
  pid: number
  port: number
  /**
   * The id this instance answers `/api/healtz` with.
   *
   * Port ownership is a restart's only proof: the child is a shell wrapping `bun`, so a signal
   * the shell dies from and `bun` survives leaves an orphan holding the port while the exit
   * handler says "gone". A replacement then loses the bind and exits — and since a failed
   * `listen` announces nothing on its own, everything keeps reporting healthy while the older
   * build is what is being served.
   */
  bootId?: string
}

export interface LocalRunRecord {
  dir: string
  startedAt: string
  api?: LocalProcessRecord
  worker?: LocalProcessRecord
  /** The process serving the built browser app — this connector itself, not a child. */
  web?: LocalProcessRecord
}

const runFile = (dir: string): string => p.join(dir, CONNECT_RUN_FILE)

export const readRun = async (dir: string): Promise<LocalRunRecord | null> => {
  const content = await fs.readFile(runFile(dir), 'utf-8').catch(() => null)
  if (content == null) return null

  try {
    const parsed: unknown = JSON.parse(content)

    return typeof parsed === 'object' && parsed !== null ? parsed as LocalRunRecord : null
  } catch {
    return null
  }
}

export const writeRun = async (dir: string, record: LocalRunRecord): Promise<void> => {
  await fs.ensureDir(p.join(dir, CONNECT_MARKER_DIR))
  await fs.writeFile(runFile(dir), `${JSON.stringify(record, null, 2)}\n`)
}

export const clearRun = async (dir: string): Promise<void> => {
  await fs.rm(runFile(dir), { force: true }).catch(() => undefined)
}

/** Whether the api recorded here is still a live process. */
export const apiRunning = (record: LocalRunRecord | null): boolean =>
  record != null && isAlive(record.api?.pid)

/**
 * Start the target's HTTP server as a detached child.
 *
 * Detached so the whole group can be signalled later — the child is a shell wrapping `bun`, and a
 * signal aimed at the shell alone leaves `bun` holding the port.
 */
export const startApi = async (
  dir: string, env: Record<string, string> = {}
): Promise<LocalProcessRecord> => {
  const bootId = randomUUID()
  const cwd = apiPath(dir)
  // A run killed without a stop leaves this child alive — detaching it is what keeps it
  // running after the tool that started it exits. What survives holds the port, and the
  // replacement then loses the bind and exits without announcing it.
  if (!await waitForPortFree(TARGET_API_PORT, 2_000)) {
    await reclaimPort(TARGET_API_PORT, TARGET_API_MARKER)
  }

  const child = spawn('bun', ['dist/index.js', TARGET_API_MARKER], {
    cwd,
    detached: true,
    shell: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ...await backendEnv(dir),
      BACKEND_PORT: `${TARGET_API_PORT}`,
      BACKEND_BOOT_ID: bootId,
      ...env,
    },
  })
  child.unref()

  return { pid: child.pid ?? -1, port: TARGET_API_PORT, bootId }
}

/**
 * Start the target's queue worker, when this tree has one.
 *
 * The SAME `dist/index.js` as the api, out of the same package tree — the argv marker is the only
 * thing separating the two processes, which is why nothing may reclaim a port without excluding
 * the other's marker. Most generated applications declare no queues, and their absence is not a
 * degraded state.
 */
export const startWorker = async (dir: string): Promise<LocalProcessRecord | null> => {
  if (!hasWorker(dir)) return null

  const cwd = workerPath(dir)
  if (cwd == null) return null

  const bootId = randomUUID()
  const child = spawn('bun', ['dist/index.js', TARGET_WORKER_MARKER], {
    cwd,
    detached: true,
    shell: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ...await backendEnv(dir),
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

/**
 * Stop a recorded process and wait for its port to actually free.
 *
 * The port and not the pid is what a replacement needs, so that is what is waited on.
 */
export const stopProcess = async (record: LocalProcessRecord | undefined): Promise<void> => {
  if (record == null) return

  if (isAlive(record.pid)) {
    signalGroup(record.pid, 'SIGTERM')
    if (!await waitForPortFree(record.port, 5_000)) {
      signalGroup(record.pid, 'SIGKILL')
    }
  }
  await waitForPortFree(record.port, 5_000)
}

/**
 * Bounce the api child so it reconciles the target's tables against its code.
 *
 * What `DbSync` means for a target that owns its own structure: every `@owlmeans/postgres`
 * resource creates and updates its table while the context initializes, so there is nothing to
 * generate and no migration file to apply — the sync IS the restart. A tree with no run in front
 * of it answers `null`: there is no process to bounce, and reporting that as a failure would send
 * a caller after a repair that does not apply.
 */
export const restartApi = async (dir: string): Promise<string | null> => {
  const record = await readRun(dir)
  if (record == null || record.api == null) return null

  const refused = await integrityRefusal(dir, 'Refused to restart')
  if (refused != null) return refused

  await stopProcess(record.api)
  const api = await startApi(dir)
  await writeRun(dir, { ...record, api })

  return null
}

/** Whether anything is answering on the api's port right now. */
export const apiListening = async (
  port: number = TARGET_API_PORT
): Promise<boolean> => await probeListening(port)

export { TARGET_API_PORT, TARGET_WEB_PORT, TARGET_WORKER_PORT }
