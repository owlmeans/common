import type { BasicContext } from '@owlmeans/context'
import type {
  ProjectionStore, Relationship, RelationshipStore, SchemaStore, ScopedSchemaRecord, SpecificationStore,
  Transition, TransitionStore, Workcard,
} from '@owlmeans/planning'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import type {
  BindablePlanningStore, CommitHub, FoldResult, PlanningServiceOptions,
} from '@owlmeans/server-planning'
import type { DEFAULT_PLANNING_POSTGRES_LIMITS } from './consts.js'

export type PlanningPostgresLimits = { -readonly [K in keyof typeof DEFAULT_PLANNING_POSTGRES_LIMITS]: number }

/** The resource aliases the store resolves its four tables by. */
export interface PlanningPostgresAliases {
  card: string
  transition: string
  link: string
  schema: string
}

export interface PlanningPostgresOptions {
  aliases?: Partial<PlanningPostgresAliases>
  /**
   * NOTIFY every settled commit and schema write on the store's channel, and LISTEN for other
   * processes' (default `true`). `false` leaves a waiter to its poll and a reader to the revision.
   */
  bus?: boolean
  limits?: Partial<PlanningPostgresLimits>
  /** Card and transition ids. */
  ids?: () => string
  /** ISO-8601 timestamps. */
  now?: () => string
}

export interface PostgresPlanningStoreOptions extends PlanningPostgresOptions {
  /** The context the four resources are registered on — read at call time, never at construction. */
  context: () => BasicContext<any> | undefined
}

/** A card row: the record, plus the allocation bookkeeping no caller ever sees. */
export interface PlanningCardRecord extends Workcard {
  /** When `head` last moved — how old a gap in the card's log is. Private to the store. */
  headAt?: string
}

/** A schema row: a record, or the private per-organization revision counter (`kind: 'head'`). */
export type PlanningSchemaRow = Omit<ScopedSchemaRecord, 'kind'> & { kind: ScopedSchemaRecord['kind'] | 'head' }

export interface PlanningCardResource extends PostgresResource<PlanningCardRecord> { }
export interface PlanningTransitionResource extends PostgresResource<Transition> { }
export interface PlanningLinkResource extends PostgresResource<Relationship> { }
export interface PlanningSchemaResource extends PostgresResource<PlanningSchemaRow> { }

export interface PostgresPlanningStore extends BindablePlanningStore {
  transitions: TransitionStore
  cards: ProjectionStore
  specs: SpecificationStore
  links: RelationshipStore
  commits: CommitHub
  schemas: SchemaStore
  /**
   * Fold what is pending for one card — one transaction under its advisory lock, the settled
   * events delivered after the commit.
   */
  fold: (cardId: string) => Promise<FoldResult>
  /** Fold every card whose oldest pending row is older than `olderThanMs`. Answers how many. */
  recover: (opts?: { olderThanMs?: number, limit?: number }) => Promise<number>
  /** Release the LISTEN connection and stop healing. */
  close: () => Promise<void>
}

export interface PostgresPlanningServiceOptions extends Omit<PlanningServiceOptions, 'store'>, PlanningPostgresOptions { }
