import type { ChildProcess } from 'node:child_process'
import type { RunOptions } from '../types.js'

/**
 * Everything that starts, bounds or ends a child process on the developer's machine.
 *
 * Shared by the shell commands, the boot check and the local run so the three cannot disagree
 * about what a failure looks like or when a port is free.
 */
export interface SpawnHelper {
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
  failureOutput: (error: unknown, stdout: string, stderr: string, cmd: string) => string
  /**
   * Run a shell command and answer "error text, or null".
   *
   * The one contract every shell command here shares. A caller never has to know whether the child
   * exited non-zero, failed to spawn or produced nothing — those are all one answer.
   */
  runCommand: (cmd: string, options: RunOptions) => Promise<string | null>
  /**
   * Run one of the target's own `scripts.*`, bounded.
   *
   * `spawn` rather than `exec` because a build's output is unbounded and streaming it costs nothing,
   * and because a wedged `bunx` resolving forever must die rather than hold the caller open. The
   * timeout is reported as a verdict, not thrown, so it reaches the same channel a failed build does.
   */
  runScript: (script: string, cwd: string, env?: Record<string, string>) => Promise<string | null>
  /**
   * Bound one whole dispatch, whatever it is.
   *
   * Every operation below already bounds itself, but one that wedges AROUND its own bound — a lock
   * nothing releases, a promise that never settles — holds the caller open with nothing to report,
   * and the caller's timeout becomes the only limit. Reaching this means the operation failed to
   * bound itself, not that it needed longer.
   */
  withDeadline: <T>(label: string, ms: number, fn: () => Promise<T>) => Promise<T>
  /** Whether anything answers a TCP connect on a local port. */
  probeListening: (port: number, timeoutMs?: number) => Promise<boolean>
  /**
   * Wait until nothing answers on a local port.
   *
   * The child spawned here is a shell wrapping `bun`, so the shell's exit is not proof the target is
   * gone: a signal the shell dies from and `bun` survives leaves an orphan that still owns the port.
   * Whether the port answers is the only fact that decides whether a replacement can bind, so a
   * restart waits on that and never on an exit event.
   */
  waitForPortFree: (port: number, timeoutMs?: number, pollMs?: number) => Promise<boolean>
  /**
   * Terminate a detached child's whole process group and wait until it is actually gone.
   *
   * Awaiting matters: the caller restarts right after, and a process still holding the port makes
   * the replacement lose the bind and exit — leaving nothing listening and no error anyone reads.
   */
  killGroupAndWait: (proc: ChildProcess, options?: { term?: number, kill?: number }) => Promise<void>
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
  reclaimPort: (port: number, marker: string) => Promise<boolean>
  /**
   * The pids whose command line carries a marker.
   *
   * `/proc` rather than `ps`, for the same reason the publisher reads it: no shell, no parsing of a
   * format that differs per platform. Somewhere without `/proc` simply has nothing to reclaim, which
   * is the honest answer there.
   */
  findProcesses: (needles: string | string[]) => Promise<number[]>
  /**
   * Signal a process GROUP, falling back to the process.
   *
   * The negative pid is the point: a child spawned detached through a shell survives a signal aimed
   * at the shell's own pid, and what survives is the `bun` process holding the port.
   */
  signalGroup: (pid: number | undefined, signal: NodeJS.Signals) => boolean
  /** Whether a recorded pid is still a live process. */
  isAlive: (pid: number | undefined) => boolean
  /** Resolve after `ms`, without holding the process open. */
  delay: (ms: number) => Promise<void>
}
