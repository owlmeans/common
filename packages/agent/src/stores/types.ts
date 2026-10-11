import type {
  ConversationEvent, ConversationEventInput, ConversationRef, CumulativeResultEntry,
  MemoryEvent, MemoryEventInput, MemoryNode, PipelineRun, PipelineRunStatus,
} from '@owlmeans/agent-common'

/**
 * Storage, as this package needs it.
 *
 * These are PORTS, not resources. The package could have taken `Resource<T>` and let a consumer
 * register a backend under an alias — but a port names exactly what the plugin needs, which is a
 * far smaller surface than CRUD, and any backend can satisfy it: a resource, or a file on disk,
 * which is what the project-history equivalent is.
 *
 * Every port is optional to bind. A plugin whose port is missing degrades to a no-op rather than
 * throwing, exactly as `ExecutionService.checkpoint` does with no plugin registered: memory is an
 * enhancement, and an application that has not wired storage yet must still be able to run agents.
 */

export interface ConversationStore {
  /** The most recent `limit` events, NEWEST FIRST. */
  last: (ref: ConversationRef, limit: number) => Promise<ConversationEvent[]>
  /** Append one event, allocating its `seq`. */
  append: (event: ConversationEventInput) => Promise<ConversationEvent>
}

export interface MemoryGraphStore {
  /** Every node of a scope, without its content — names and links only. */
  index: (scope: string) => Promise<Array<Pick<MemoryNode, 'subsystem' | 'links' | 'updatedAt'>>>
  read: (scope: string, subsystem: string) => Promise<MemoryNode | null>
  write: (node: Omit<MemoryNode, 'id' | 'updatedAt'>) => Promise<MemoryNode>
}

export interface MemoryEventStore {
  /** The most recent `limit` events of a scope, NEWEST FIRST. */
  read: (scope: string, limit: number) => Promise<MemoryEvent[]>
  /** Append one event, allocating its `seq`, and prune the scope to `limit` if given. */
  append: (event: MemoryEventInput, limit?: number) => Promise<MemoryEvent>
}

/**
 * Where a pipeline run's position lives — the ONE authority on where a run stands.
 *
 * Deliberately not the LangGraph checkpoint: that is size-guarded and expires, so a design that
 * trusts it has a silent hole exactly where a crashed run needs an answer. Every reader of a run's
 * position — a resume, a reconciler, an operator, a status endpoint — reads this.
 *
 * `save` is an UPSERT on `runId`, and it is on the hot path: the runner awaits it inside every node
 * before the node returns, so a crash cannot lose a step that finished.
 */
export interface PipelineRunStore {
  load: (runId: string) => Promise<PipelineRun | null>
  save: (run: PipelineRun) => Promise<void>
  /**
   * The runs a sweeper cares about. `staleBefore` compares against `heartbeatAt` — the only signal
   * that separates a run still working from one whose process died.
   */
  find: (query: {
    scope?: string
    pipeline?: string
    status?: PipelineRunStatus
    staleBefore?: string
    limit?: number
  }) => Promise<PipelineRun[]>
}

/**
 * Where cumulative pipeline results are kept between steps, and between processes.
 *
 * An OPTIMIZATION of the ledger, never its authority: every entry of a finished step can be read
 * again from the step's durable inputs, and is — silently — whenever a resume finds it missing. A
 * store that loses an entry costs the next step some context, never a correct resume.
 */
export interface CumulativeResultStore {
  /**
   * Every entry of a ledger, in any order. Read on a run's entry and around every step — a run
   * composed under a step writes through its own plugin instance, and this is how the parent
   * learns what it wrote — so it is on the warm path: an index on `ledger` is the whole design.
   */
  list: (ledger: string) => Promise<CumulativeResultEntry[]>
  /** UPSERT on `(ledger, runId, step)`. */
  put: (entry: CumulativeResultEntry) => Promise<void>
  /**
   * Drop a ledger's entries — all of them, or those of ONE run and every run composed under it
   * (`<runId>/…`), which is how a fresh start forgets what an earlier attempt of the same run said.
   */
  clear: (ledger: string, runId?: string) => Promise<void>
}

/**
 * One LangGraph checkpoint, as this package needs it.
 *
 * Payloads are base64 of whatever the serde produced — never `JSON.stringify`, which would turn an
 * `AIMessage` into a plain object that no `instanceof` downstream recognises again. The port never
 * looks inside; the adapter in `../checkpoint/saver.ts` owns the protocol.
 */
export interface CheckpointRecord {
  threadId: string
  ns: string
  checkpointId: string
  parentCheckpointId?: string
  /** The serde's own type tag for both payloads. */
  type: string
  checkpoint: string
  metadata: string
  createdAt: string
}

export interface CheckpointWriteRecord {
  threadId: string
  ns: string
  checkpointId: string
  taskId: string
  /**
   * The write's position, or a NEGATIVE well-known index for a control channel
   * (`WRITES_IDX_MAP`). The sign decides the write rule: a positive index is first-wins
   * (`setOnInsert`), a negative one is last-wins (`set`).
   */
  idx: number
  channel: string
  type: string
  value: string
  taskPath?: string
}

export interface CheckpointStore {
  /** The newest checkpoint of a thread, or one named exactly. */
  one: (threadId: string, ns: string, checkpointId?: string) => Promise<CheckpointRecord | null>
  /** Newest first. `beforeId` is exclusive. */
  page: (query: {
    threadId: string
    ns?: string
    beforeId?: string
    limit?: number
  }) => Promise<CheckpointRecord[]>
  put: (record: CheckpointRecord) => Promise<void>
  writesFor: (
    threadId: string, ns: string, checkpointIds: string[]
  ) => Promise<CheckpointWriteRecord[]>
  putWrites: (records: CheckpointWriteRecord[]) => Promise<void>
  dropThread: (threadId: string) => Promise<void>
}
