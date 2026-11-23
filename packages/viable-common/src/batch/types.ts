import type {
  AgentStopScope, WorkcardBatchKind, WorkcardBatchOrderSource, WorkcardBatchOutcome, WorkcardBatchStatus,
} from './consts.js'

/** How a batch's order was decided, and the one-line reason of each story's place (keyed by card id). */
export interface WorkcardBatchOrdering {
  source: WorkcardBatchOrderSource
  reasons: Record<string, string>
}

/**
 * A story batch as every reader receives it — the browser, a connector, the conversion's view.
 *
 * Stories are named by CARD id everywhere in it; `codes` maps each to its story code for display.
 * Dates are ISO strings.
 */
export interface WorkcardBatchView {
  id: string
  projectId: string
  kind: WorkcardBatchKind
  status: WorkcardBatchStatus
  /** Story card ids, in implementation order (the board's until the ordering has written its own). */
  stories: string[]
  /** Card id → story code. */
  codes: Record<string, string>
  ordering?: WorkcardBatchOrdering
  /** The story the batch last started. */
  current?: string
  /** Card id → what became of it; a story without an entry has not finished in this batch. */
  outcomes: Record<string, WorkcardBatchOutcome>
  /** Why a halted batch stopped: a refusal marker, or {@link WORKCARD_BATCH_STALLED}. */
  reason?: string
  createdAt: string
  updatedAt: string
  finishedAt?: string
}

/** Start a batch. `stories` (card ids) omitted or `null`: every planned story of the project. */
export interface WorkcardBatchStartArgs {
  stories?: string[]
}

/**
 * Stop what the agent runs. `scope` omitted: whatever runs now. `storyId` names the story in
 * progress a story stop is meant for — refused when another one is. `confirm`: a person agreed to a
 * stop that rolls code back.
 */
export interface AgentStopArgs {
  scope?: AgentStopScope
  storyId?: string
  confirm?: boolean
}

/** A message for the open-ended change that runs now; it is read before the agent's next model call. */
export interface AgentSteerArgs {
  prompt: string
}

/** A steering message accepted: queued for the running agent under its own id. */
export interface AgentSteerResult {
  queued: true
  id: string
}
