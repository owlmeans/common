import type { McpToolAnswer } from '../types.js'

/** One platform call a tool started, running or settled. */
export interface InflightCall {
  /** The tool that started it. */
  tool: string
  /** The tool and its arguments — an identical repeat joins this call instead of starting another. */
  key: string
  /** Resolves with the call's answer, refusals already phrased; never rejects. */
  done: Promise<McpToolAnswer>
  /** The answer once the call settled; `null` while it runs. */
  answer: McpToolAnswer | null
}

/**
 * The platform calls the delegated mode's tools started, kept until somebody has been given their
 * answer.
 *
 * A call is ATTENDED while a tool is waiting on it — the one that started it, or an identical repeat
 * that joined it — and that tool answers with it. Once every waiter has answered something else (a
 * model task the call is blocked on, or "still running"), it is DETACHED, and its answer, when it
 * comes, is reported by `submit_task_result` or `next_task`.
 */
export interface InflightCalls {
  /**
   * The call this tool already runs with these arguments, or a new one `run` starts. Either way the
   * caller is counted as waiting on it until it calls `release` or `forget`.
   */
  join: (tool: string, args: Record<string, unknown>, run: () => Promise<McpToolAnswer>) => InflightCall
  /** The caller stops waiting without the answer; the call goes on, detached once nobody waits. */
  release: (call: InflightCall) => void
  /** The caller answered with the call's own answer: nobody needs to be told it again. */
  forget: (call: InflightCall) => void
  /** Detached calls that settled, each forgotten as it is returned — reported exactly once. */
  drainSettled: () => InflightCall[]
  /** Whether a detached call has settled and nobody has been told yet. */
  hasSettled: () => boolean
  /**
   * Calls still running that no tool waits on — the ones whose answer the task loop will report.
   * An attended call is left out: the tool waiting on it answers with it.
   */
  running: () => InflightCall[]
  /**
   * Whether a detached call has settled, waiting up to `waitMs` for one to; `true` at once when one
   * already has. Takes nothing — `drainSettled` does.
   */
  settled: (waitMs: number, signal?: AbortSignal) => Promise<boolean>
}
