import type { ToolDeps, ToolResult } from '../types.js'

/** One platform call a tool waits on for a while, and the answer it gives when the call goes on past that. */
export interface AttendedCall {
  /** The tool — with {@link args}, what an identical repeat joins. */
  tool: string
  args: Record<string, unknown>
  /** The platform call and how its outcome reads. A throw is phrased as the tool's refusal. */
  run: () => Promise<ToolResult>
  /**
   * What the tool answers while the call goes on. `rejoinable` — the host keeps this process between
   * calls (stdio), so calling the same tool again with the same arguments waits on the same call.
   */
  pending: (rejoinable: boolean) => Promise<ToolResult>
  /** How long the tool waits before answering {@link pending}; `ATTEND_ANSWER_MS` by default. */
  waitMs?: number
}

/**
 * A tool's platform call that may outlast the tool's own deadline — a triaged request, a change of a
 * project's apps — answered inside it and COLLECTED by an identical repeat.
 *
 * The call is joined in the deps' in-flight registry (`deps.inflight`; a per-API registry when the deps
 * carry none), keyed by the tool and its arguments, and raced against the answer deadline: settled — its
 * own answer; still running — {@link AttendedCall.pending}, the call left running detached. An identical
 * repeat joins the running call, or answers the settled one that nobody was told yet — once, and only
 * within `ATTEND_REJOIN_MS` of its settling: later the same words are a new request. In the delegated
 * mode the handover already attends every tool, so the call simply runs.
 */
export interface AttendedCallHelper {
  attend: (deps: ToolDeps, call: AttendedCall) => Promise<ToolResult>
}
