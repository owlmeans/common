/**
 * Run all · Stop · Steer — the vocabulary of a story BATCH (several stories implemented one after
 * another, in an order the platform chooses) and of the controls a person has over the agent while
 * it works: stopping it and sending it a message.
 *
 * Declared here because four runtimes read the same names — the API services that start, stop and
 * steer, the agent that orders a batch, the browser that draws it and the connector SDK whose tools
 * report it — and a status spelled twice is a batch two of them disagree about.
 */

/** Who started a batch: a person's Run all, or a conversion's implementation stage. */
export enum StoryBatchKind {
  /** A person's Run all (the web or a connector): every start passes the story gate. */
  Stories = 'stories',
  /** A conversion's implementation stage: admitted when the stage was, and ends the conversion. */
  Conversion = 'conversion',
}

/** Where a batch stands. `Ordering` and `Running` are live; the other three are final. */
export enum StoryBatchStatus {
  /** The platform is choosing the implementation order; nothing has started yet. */
  Ordering = 'ordering',
  /** Its stories are being implemented, one at a time. */
  Running = 'running',
  /** Every story of it has an outcome. */
  Completed = 'completed',
  /** A person stopped it: no further story starts. */
  Cancelled = 'cancelled',
  /** It cannot go on — the balance, the spend consent, or a story nothing runs any more (`reason`). */
  Halted = 'halted',
}

/** What became of one story of a batch. A story with an outcome is never started by it again. */
export enum StoryBatchOutcome {
  Completed = 'completed',
  Failed = 'failed',
  /** A person stopped it: its changes were rolled back and it is planned again. */
  Stopped = 'stopped',
  /** Gone from the project before its turn. */
  Skipped = 'skipped',
  /** Its start was refused for a reason of its own; the batch went on with the next one. */
  Refused = 'refused',
}

/** Who decided a batch's order: the model, the type graph alone, or the board as it stood. */
export enum StoryBatchOrderSource {
  Model = 'model',
  Graph = 'graph',
  Board = 'board',
}

/** What a stop addresses: the run in progress, the story in progress, or the whole batch. */
export enum AgentStopScope {
  /** Whatever runs now — an open-ended change stops once the model's current answer arrives. */
  Run = 'run',
  /** The story in progress: it stops at its next step and is rolled back to its start. */
  Story = 'story',
  /** The batch: no further story starts, and the story in progress is stopped as for `Story`. */
  Batch = 'batch',
}

/** The statuses of a batch that is still under way — at most one per project. */
export const STORY_BATCH_LIVE: readonly StoryBatchStatus[] = Object.freeze([
  StoryBatchStatus.Ordering, StoryBatchStatus.Running,
])

/** The most stories one batch takes. */
export const STORY_BATCH_MAX = 256

/** The longest message a person may send a running agent — the length of a free-flight prompt. */
export const AGENT_STEER_PROMPT_MAX = 16384

/** The longest one-line reason the ordering gives for a story's place. */
export const STORY_BATCH_REASON_MAX = 1024

/** The `reason` of a batch halted because the story it started stopped moving and nothing runs it. */
export const STORY_BATCH_STALLED = 'stalled'

/** The marker of {@link AgentNotRunning}: nothing stoppable or steerable runs (`agent-not-running:<what>`). */
export const AGENT_NOT_RUNNING_MARKER = 'agent-not-running'

/** The marker of {@link StoryBatchActive}: a batch already runs (`story-batch-active:<batchId>`). */
export const STORY_BATCH_ACTIVE_MARKER = 'story-batch-active'

/** The marker of {@link StoryBatchEmpty}: no planned story was selected (`story-batch-empty`). */
export const STORY_BATCH_EMPTY_MARKER = 'story-batch-empty'
