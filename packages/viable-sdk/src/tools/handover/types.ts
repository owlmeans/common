import type { ModelTask } from '@owlmeans/viable-common'
import type { SessionRuntime } from '../../types.js'
import type { InflightCall } from '../inflight/types.js'
import type { McpToolAnswer, ToolDefinition, ToolResult } from '../types.js'

/** What the task loop found once it had done its own work. */
export interface HandoverCollection {
  /** Detached calls that settled — each reported here and nowhere else. */
  settled: InflightCall[]
  /** The next model task, taken; `null` when none was queued. */
  task: ModelTask | null
  /** Calls still running on the platform that no tool waits on. */
  running: InflightCall[]
}

/**
 * The delegated mode's tool calls: a platform call that stops for a model call its own parent must
 * perform is answered with that TASK, and its result is delivered by the task loop afterwards.
 *
 * Bound to the tool deps, whose `inflight` registry outlives every session the connector reopens.
 */
export interface HandoverHelper {
  /**
   * Answer one tool call: its result when the call finishes first, the model task it is blocked on
   * when one arrives first, or "still running" at `HANDOVER_WAIT_MS`. The call itself is never
   * abandoned — an identical repeat joins it, and its result is reported by the task loop.
   */
  run: (tool: ToolDefinition, args: Record<string, unknown>) => Promise<McpToolAnswer>
  /**
   * A tool's result as the MCP wire carries it; a throw becomes a phrased `isError` answer, logged,
   * and pushed through `notify` when only a person can resolve it. Never rejects.
   */
  contain: (tool: string, run: () => Promise<ToolResult>) => Promise<McpToolAnswer>
  /**
   * Wait up to `waitMs` for a detached call to settle or a model task to arrive, then take both
   * what settled and the next queued task.
   */
  collect: (session: SessionRuntime, waitMs: number) => Promise<HandoverCollection>
  /**
   * The collection as a tool result led by `lead`; `null` when it holds nothing at all, so the
   * caller answers in its own words. Every settled call is in `structured.settled[]`, a refused one
   * marked `isError` there and never on the result itself.
   */
  report: (collected: HandoverCollection, lead?: string) => ToolResult | null
  /**
   * Whether a call no tool waits on is running or settled-and-unreported — what makes the task loop
   * wait for one.
   */
  pending: () => boolean
}
