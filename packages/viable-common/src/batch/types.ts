import type {
  AgentStopScope, StoryBatchKind, StoryBatchOrderSource, StoryBatchOutcome, StoryBatchStatus,
} from './consts.js'

/** How a batch's order was decided, and the one-line reason of each story's place (keyed by card id). */
export interface StoryBatchOrdering {
  source: StoryBatchOrderSource
  reasons: Record<string, string>
}

/**
 * A story batch as every reader receives it — the browser, a connector, the conversion's view.
 *
 * Stories are named by CARD id everywhere in it; `codes` maps each to its story code for display.
 * Dates are ISO strings.
 */
export interface StoryBatchView {
  id: string
  projectId: string
  kind: StoryBatchKind
  status: StoryBatchStatus
  /** Story card ids, in implementation order (the board's until the ordering has written its own). */
  stories: string[]
  /** Card id → story code. */
  codes: Record<string, string>
  ordering?: StoryBatchOrdering
  /** The story the batch last started. */
  current?: string
  /** Card id → what became of it; a story without an entry has not finished in this batch. */
  outcomes: Record<string, StoryBatchOutcome>
  /** Why a halted batch stopped: a refusal marker, or {@link STORY_BATCH_STALLED}. */
  reason?: string
  createdAt: string
  updatedAt: string
  finishedAt?: string
}

/** Start a batch. `stories` (card ids) omitted or `null`: every planned story of the project. */
export interface StoryBatchStartArgs {
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
