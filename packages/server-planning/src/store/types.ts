import type {
  CommitEvent, CommitSource, CommitStatus, PlanningStore, ProjectionStore, Relationship,
  RelationshipStore, SpecificationStore, Transition, TransitionStore, Workcard,
} from '@owlmeans/planning'

/** What a folding store calls for every committed transition — the service's `committed`. */
export interface CommitListener {
  (event: CommitEvent): Promise<void>
}

/**
 * A store the planning service can hand its `committed` to.
 *
 * `appendPlanningService` calls `bind` on the default store and on every plugin store it resolves,
 * so the process that FOLDS is the process that runs the `after` chain. A store without `bind`
 * reaches the service some other way (a durable store's projection processor looks it up on the
 * context).
 */
export interface BindablePlanningStore extends PlanningStore {
  bind?: (committed: CommitListener) => void
}

export interface CommitHubOptions {
  /** The authoritative answer for one transition, or `null` when the store has no such row. */
  status: (transition: string) => Promise<CommitStatus | null>
  /** Settled events remembered for `status` after their row is gone. */
  remember?: number
  /** The poll ladder `wait` climbs, in milliseconds; the last step repeats. */
  ladder?: readonly number[]
}

/** An in-process commit fan-out: the `CommitSource` a store answers with, plus the publishing half. */
export interface CommitHub extends CommitSource {
  /** Deliver an event to every matching subscriber. A listener that throws is logged, never rethrown. */
  publish: (event: CommitEvent) => Promise<void>
  /** A settled event remembered by transition id, whether or not its row still exists. */
  recall: (transition: string) => CommitEvent | undefined
  /** How many subscribers are attached. */
  listeners: () => number
}

export interface FoldOptions {
  /** The service's `committed` — run once per committed transition, after `publish`. */
  onCommitted?: CommitListener
  /** Where commit events go. Strip `record` before a cross-process bus. */
  publish?: (event: CommitEvent) => Promise<void>
  now?: () => string
  /** The most transitions one call folds; the rest is reported as `followUp`. Unlimited when omitted. */
  limit?: number
  /** Called between transitions — a queue processor renews its lock here. */
  touch?: () => Promise<void>
}

export interface FoldResult {
  card: Workcard | null
  folded: number
  failed: number
  /** More pending transitions than `limit` allowed in one call. */
  followUp: boolean
}

export interface MemoryPlanningStoreSeed {
  cards?: Workcard[]
  links?: Relationship[]
  transitions?: Transition[]
}

export interface MemoryPlanningStoreOptions {
  /** Fold and publish inside `project()`. Default `true`; `false` folds only on `flush()`. */
  sync?: boolean
  ids?: () => string
  now?: () => string
  seed?: MemoryPlanningStoreSeed
  /** The commit listener used until a service binds its own. */
  onCommitted?: CommitListener
  alias?: string
}

export interface MemoryPlanningStore extends BindablePlanningStore {
  transitions: TransitionStore
  cards: ProjectionStore
  specs: SpecificationStore
  links: RelationshipStore
  commits: CommitHub
  bind: (committed: CommitListener) => void
  /** Fold what is pending — for one card, or for every card with a pending transition. */
  flush: (card?: string) => Promise<void>
}

/** One owning route of a composite store. */
export interface StoreRoute {
  owns: (type: string) => boolean
  store: PlanningStore
}
