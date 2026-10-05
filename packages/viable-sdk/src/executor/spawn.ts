import { exec, spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import fsp from 'node:fs/promises'
import { KILL_TIMEOUT, PORT_FREE_TIMEOUT, PORT_POLL_MS, TARGET_SCRIPT, TERM_TIMEOUT } from './consts.local.js'
import { BUILD_TIMEOUT, MAX_OUTPUT_BUFFER } from './consts.js'
import type { RunOptions } from './types.js'
import type { SpawnHelper } from './spawn/types.js'

/**
 * Everything that starts, bounds or ends a child process on the developer's machine.
 *
 * Shared by the shell commands, the boot check and the local run so the three cannot disagree
 * about what a failure looks like or when a port is free — the publisher learned both lessons the
 * expensive way, and neither of them is about Kubernetes.
 */

export const createSpawnHelper = (): SpawnHelper => {
  const failureOutput = (
    error: unknown, stdout: string, stderr: string, cmd: string
  ): string => {
    const body = [stdout, stderr].map(part => part.trim()).filter(Boolean).join('\n')
    const code = (error as { code?: number } | null)?.code ?? 1

    return body !== '' ? `${body}\nexit ${code}: ${cmd}` : `exit ${code}: ${cmd}`
  }

  const runCommand = async (cmd: string, options: RunOptions): Promise<string | null> =>
    await new Promise<string | null>(resolve => {
      exec(
        cmd,
        {
          cwd: options.cwd,
          maxBuffer: MAX_OUTPUT_BUFFER,
          env: options.env != null ? { ...process.env, ...options.env } : process.env,
        },
        (error, stdout, stderr) => {
          if (error != null) {
            return resolve(options.stdoutOnly === true
              ? stdout
              : failureOutput(error, stdout, stderr, cmd))
          }
          resolve(null)
        }
      )
    })

  const runScript = async (
    script: string, cwd: string, env?: Record<string, string>
  ): Promise<string | null> => await new Promise<string | null>(resolve => {
    const proc = spawn('bun', ['run', script], {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(env ?? {}) },
    })

    let out = ''
    let err = ''
    let settled = false
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch { /* already gone */ }
      finish(`${script} timed out after ${BUILD_TIMEOUT}ms`)
    }, BUILD_TIMEOUT)
    timer.unref?.()

    proc.stdout?.on('data', chunk => { out += chunk.toString() })
    proc.stderr?.on('data', chunk => { err += chunk.toString() })
    // A spawn error never reaches the exit handler, so it is answered here or it is lost.
    proc.on('error', error => finish(`${error}`))
    proc.on('exit', code => finish(code === 0 ? null : `${out}\n${err}`))
  })

  const withDeadline = async <T>(
    label: string, ms: number, fn: () => Promise<T>
  ): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Slot command timed out: ${label} after ${ms}ms`)), ms
          )
          timer.unref?.()
        }),
      ])
    } finally {
      if (timer != null) clearTimeout(timer)
    }
  }

  const probeListening = async (port: number, timeoutMs = 1_000): Promise<boolean> =>
    await new Promise<boolean>(resolve => {
      const socket = net.connect({ host: '127.0.0.1', port })
      const done = (value: boolean) => {
        socket.removeAllListeners()
        socket.destroy()
        resolve(value)
      }
      socket.setTimeout(timeoutMs)
      socket.once('connect', () => done(true))
      socket.once('timeout', () => done(false))
      socket.once('error', () => done(false))
    })

  const waitForPortFree = async (
    port: number, timeoutMs = PORT_FREE_TIMEOUT, pollMs = PORT_POLL_MS
  ): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      if (!await probeListening(port)) {
        return true
      }
      if (Date.now() >= deadline) {
        return false
      }
      await delay(pollMs)
    }
  }

  const killGroupAndWait = async (
    proc: ChildProcess, options: { term?: number, kill?: number } = {}
  ): Promise<void> => {
    const term = options.term ?? TERM_TIMEOUT
    const kill = options.kill ?? KILL_TIMEOUT
    const pid = proc.pid

    // NEVER an early return on the child's own exit code. The child is a shell wrapping `bun`, so a
    // signal the shell dies from leaves `bun` alive and holding the port while `exitCode` says it is
    // gone — the exact shape that leaves a stray server running on somebody's machine and every
    // later boot check failing with "the api port is already in use".
    signalGroup(pid, 'SIGTERM')
    if (await gone(pid, term)) return

    signalGroup(pid, 'SIGKILL')
    await gone(pid, kill)
  }

  /** Whether a process group is still around. EPERM counts as alive: it exists and is not ours. */
  const groupAlive = (pid: number | undefined): boolean => {
    if (pid == null) return false
    try {
      process.kill(-pid, 0)

      return true
    } catch (e) {
      if ((e as { code?: string }).code === 'EPERM') return true
      try {
        process.kill(pid, 0)

        return true
      } catch (own) {
        return (own as { code?: string }).code === 'EPERM'
      }
    }
  }

  /**
   * Wait until the whole GROUP is gone, or the budget runs out.
   *
   * Polled rather than awaited on the child's `exit` event, because that event is about the shell
   * and the thing worth waiting for is whatever it started.
   */
  const gone = async (pid: number | undefined, budgetMs: number): Promise<boolean> => {
    const deadline = Date.now() + budgetMs
    for (;;) {
      if (!groupAlive(pid)) return true
      if (Date.now() >= deadline) return false
      await delay(50)
    }
  }

  const reclaimPort = async (port: number, marker: string): Promise<boolean> => {
    if (!await probeListening(port)) return true

    // BOTH the script and the marker. A marker alone would match any process whose command line
    // merely mentions it — a shell the user is typing in, a grep, an editor — and this sends SIGKILL.
    const orphans = await findProcesses([TARGET_SCRIPT, marker])
    if (orphans.length < 1) return false

    for (const pid of orphans) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }

    return await waitForPortFree(port)
  }

  const findProcesses = async (needles: string | string[]): Promise<number[]> => {
    const wanted = Array.isArray(needles) ? needles : [needles]
    const pids: number[] = []
    let entries: string[]
    try {
      entries = await fsp.readdir('/proc')
    } catch {
      return pids
    }

    for (const entry of entries) {
      const pid = Number(entry)
      if (!Number.isInteger(pid) || pid === process.pid) continue
      try {
        const cmdline = (await fsp.readFile(`/proc/${entry}/cmdline`, 'utf8')).replace(/\0/g, ' ').trim()
        if (cmdline !== '' && wanted.every(needle => cmdline.includes(needle))) pids.push(pid)
      } catch {
        // Ended mid-scan, or not ours to read — either way not a target.
      }
    }

    return pids
  }

  const signalGroup = (pid: number | undefined, signal: NodeJS.Signals): boolean => {
    if (pid == null) return false
    try {
      process.kill(-pid, signal)

      return true
    } catch {
      try {
        process.kill(pid, signal)

        return true
      } catch {
        return false
      }
    }
  }

  const isAlive = (pid: number | undefined): boolean => {
    if (pid == null) return false
    try {
      process.kill(pid, 0)

      return true
    } catch {
      return false
    }
  }

  const delay = async (ms: number): Promise<void> => await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })

  return { failureOutput, runCommand, runScript, withDeadline, probeListening, waitForPortFree, killGroupAndWait, reclaimPort, findProcesses, signalGroup, isAlive, delay }
}

export const spawnHelper = createSpawnHelper()
