import type { AgentSteerResult, AgentStopScope, ConnectAgentLock, StoryBatchView } from '@owlmeans/viable-common'

/** How the agent's controls — stopping it, steering it, cancelling a story batch — are put into words. */
export interface ControlToolHelper {
  /** Whether a stop of this scope rolls code back, so a person must have agreed (`confirm: true`). */
  stopNeedsConfirm: (scope?: AgentStopScope) => boolean
  /** The answer to a stop that rolls code back and was not confirmed: what it would do, ask first. */
  unconfirmedStop: (scope?: AgentStopScope) => string
  /** The answer to a batch cancel that was not confirmed. */
  unconfirmedCancel: () => string
  /** What a requested stop does from here, and how to follow it. */
  renderStop: (projectId: string, lock: ConnectAgentLock, scope?: AgentStopScope) => string
  /** A queued steering message, and when the agent reads it. */
  renderSteer: (projectId: string, result: AgentSteerResult) => string
  /** A cancelled batch, led by whether the story it was implementing was stopped too. */
  renderCancel: (view: StoryBatchView, storyStopped: boolean) => string
}
