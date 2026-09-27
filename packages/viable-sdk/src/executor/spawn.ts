import { exec, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import net from 'node:net'
import fsp from 'node:fs/promises'

/**
 * Everything that starts, bounds or ends a child process on the developer's machine.
 *
 * Shared by the shell commands, the boot check and the local run so the three cannot disagree
 * about what a failure looks like or when a port is free — the publisher learned both lessons the
 * expensive way, and neither of them is about Kubernetes.
 */

/**
 * Output ceiling for every validate/build child process.
 *
 * Node's default is 1 MiB, and a target project with a few hundred type errors exceeds it: the
 * child is killed and the fixer receives `stdout maxBuffer length exceeded` instead of the errors
 * it is supposed to repair.
 */
export const MAX_OUTPUT_BUFFER = 10 * 1024 * 1024

/** One-shot script ceiling. A build that outlives it is wedged, not slow. */
export const BUILD_TIMEOUT = 300_000

/** How long a port may stay bound after the process holding it was told to die. */
const PORT_FREE_TIMEOUT = 10_000
const PORT_POLL_MS = 200

const TERM_TIMEOUT = 5_000
const KILL_TIMEOUT = 2_000

/**
 * Compose a failed command's output into the text a fixer reads.
 *
 * Never interpolate the `ExecException` beside `stderr`: its string form is
 * `Error: Command failed: <cmd>\n<stderr>`, so the naive `${stdout} ${error} ${stderr}` shape
 * emitted every diagnostic twice and prefixed a runner sentence that is not a diagnostic at all.
 * Both survive into the fix conversation — the duplicate doubles the prompt for nothing, and the
 * preamble is what a model latches onto when it cannot see a real cause. Say it once, and say
 * what actually ran only when there is nothing else to report.
 */
export const failureOutput = (
  error: unknown, stdout: string, stderr: string, cmd: string
): string => {
  const body = [stdout, stderr].map(part => part.trim()).filter(Boolean).join('\n')
  const code = (error as { code?: number } | null)?.code ?? 1

  return body !== '' ? `${body}\nexit ${code}: ${cmd}` : `exit ${code}: ${cmd}`
}

export interface RunOptions {
  cwd: string
  env?: Record<string, string>
  /** Answer with stdout alone on failure — what a type check's diagnostics are. */
  stdoutOnly?: boolean
}

/**
 * Run a shell command and answer "error text, or null".
 *
 * The one contract every shell command here shares. A caller never has to know whether the child
 * exited non-zero, failed to spawn or produced nothing — those are all one answer.
 */
export const runCommand = async (cmd: string, options: RunOptions): Promise<string | null> =>
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

/**
 * Run one of the target's own `scripts.*`, bounded.
 *
 * `spawn` rather than `exec` because a build's output is unbounded and streaming it costs nothing,
 * and because a wedged `bunx` resolving forever must die rather than hold the caller open. The
 * timeout is reported as a verdict, not thrown, so it reaches the same channel a failed build does.
 */
export const runScript = async (
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

/**
 * Bound one whole dispatch, whatever it is.
 *
 * Every operation below already bounds itself, but one that wedges AROUND its own bound — a lock
 * nothing releases, a promise that never settles — holds the caller open with nothing to report,
 * and the caller's timeout becomes the only limit. Reaching this means the operation failed to
 * bound itself, not that it needed longer.
 */
export const withDeadline = async <T>(
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

/** Whether anything answers a TCP connect on a local port. */
export const probeListening = async (port: number, timeoutMs = 1_000): Promise<boolean> =>
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

/**
 * Wait until nothing answers on a local port.
 *
 * The child spawned here is a shell wrapping `bun`, so the shell's exit is not proof the target is
 * gone: a signal the shell dies from and `bun` survives leaves an orphan that still owns the port.
 * Whether the port answers is the only fact that decides whether a replacement can bind, so a
 * restart waits on that and never on an exit event.
 */
export const waitForPortFree = async (
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

/**
 * Terminate a detached child's whole process group and wait until it is actually gone.
 *
 * Awaiting matters: the caller restarts right after, and a process still holding the port makes
 * the replacement lose the bind and exit — leaving nothing listening and no error anyone reads.
 */
export const killGroupAndWait = async (
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

/** What every target process runs; the marker is what tells the three of them apart. */
const TARGET_SCRIPT = 'dist/index.js'

/**
 * Take a port back from a leftover running the same command.
 *
 * A connector that was killed — a host restart, a Ctrl-C, a crashed run — leaves its DETACHED
 * children alive, because detaching them is what keeps a build from dying with the tool that
 * started it. What survives holds the target's port, and every later attempt then fails with the
 * target's own "the api port is already in use", which reads as a defect in the generated app.
 *
 * Matched by the marker the spawn carries, never by the port alone: a process this connector did
 * not start is not ours to signal, whatever it is sitting on.
 */
export const reclaimPort = async (port: number, marker: string): Promise<boolean> => {
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

/**
 * The pids whose command line carries a marker.
 *
 * `/proc` rather than `ps`, for the same reason the publisher reads it: no shell, no parsing of a
 * format that differs per platform. Somewhere without `/proc` simply has nothing to reclaim, which
 * is the honest answer there.
 */
export const findProcesses = async (needles: string | string[]): Promise<number[]> => {
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

/**
 * Signal a process GROUP, falling back to the process.
 *
 * The negative pid is the point: a child spawned detached through a shell survives a signal aimed
 * at the shell's own pid, and what survives is the `bun` process holding the port.
 */
export const signalGroup = (pid: number | undefined, signal: NodeJS.Signals): boolean => {
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

/** Whether a recorded pid is still a live process. */
export const isAlive = (pid: number | undefined): boolean => {
  if (pid == null) return false
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

export const delay = async (ms: number): Promise<void> => await new Promise<void>(resolve => {
  const timer = setTimeout(resolve, ms)
  timer.unref?.()
})
