import type { CommitEvent, Unsubscribe } from '@owlmeans/planning'
import type { SqlRunner, SqlContext, PlanningCardResource, PlanningTables, PlanningPostgresLimits, PlanningLinkResource, PlanningTransitionResource } from '../types.js'
import type { Pool } from 'pg'

import type { CommitHub, CommitListener, FoldResult } from '@owlmeans/server-planning/store'

/** A settled commit, without its record — the card is re-read where one is needed. */
export interface CommitFrame {
  p: string
  t: 'c'
  e: Omit<CommitEvent, 'record'>
}

/** A write of an organization's data-defined schemas. */
export interface SchemaFrame {
  p: string
  t: 's'
  e: string
}

export type BusFrame = CommitFrame | SchemaFrame

export interface PlanningBus {
  enabled: boolean
  /** NOTIFY a frame inside a transaction — delivered only if it commits. A no-op when disabled. */
  notify: (runner: SqlRunner, frame: Omit<CommitFrame, 'p'> | Omit<SchemaFrame, 'p'>) => Promise<void>
  onCommit: (listener: (event: CommitEvent) => void | Promise<void>) => Unsubscribe
  onSchema: (listener: (entityId: string) => void) => Unsubscribe
  /** Open the LISTEN connection if it is not open (lazily, on the first subscription or wait). */
  ensure: () => void
  connected: () => boolean
  close: () => Promise<void>
}

export interface PlanningBusOptions {
  enabled: boolean
  processId: string
  /** The qualified transition table — what the channel name is derived from. */
  table: () => Promise<string>
  /** The pool whose configuration the dedicated connection copies. */
  pool: () => Promise<Pool>
}

export interface CardPortDeps {
  sql: () => Promise<SqlContext>
  resource: () => PlanningCardResource
  project: (card: string) => Promise<void>
  purge: (project: string, entityId: string) => Promise<number>
}

/** One open fold transaction: its runner, a savepoint helper, and what must happen after it commits. */
export interface FoldContext extends SqlContext {
  /** Run as one unit: a failure rolls back to before it, and the transaction stays usable. */
  savepoint: <R>(run: () => Promise<R>) => Promise<R>
  /** Settled events, delivered in order once the transaction commits. */
  events: CommitEvent[]
  /** Organizations whose schema revision moved in this transaction. */
  schemas: Set<string>
}

export interface FoldEngineDeps {
  pool: () => Promise<Pool>
  tables: () => Promise<PlanningTables>
  limits: PlanningPostgresLimits
  ids: () => string
  now: () => string
  bus: PlanningBus
  hub: CommitHub
  committed: () => CommitListener | undefined
  /** Told of every organization whose schemas this process changed, after the commit. */
  schemasTouched: (entityId: string) => void
  closed: () => boolean
}

export interface FoldEngine {
  /** Fold now, waiting for another folder's lock — what `project()` runs. */
  fold: (cardId: string) => Promise<FoldResult>
  /** Fold in the background unless another folder holds the card — deduplicated per card. */
  heal: (cardId: string) => void
  recover: (opts?: { olderThanMs?: number, limit?: number }) => Promise<number>
  /** Purge a project (outside a fold) in one transaction under the project's lock. */
  purge: (project: string, entityId: string) => Promise<number>
}

export interface LinkPortDeps {
  sql: () => Promise<SqlContext>
  resource: () => PlanningLinkResource
  ids: () => string
}

export interface SchemaPortDeps {
  sql: () => Promise<SqlContext>
  pool: () => Promise<Pool>
  tables: () => Promise<PlanningTables>
  bus: PlanningBus
  ids: () => string
  now: () => string
  /** Every local watcher, told after a write of this process commits. */
  touched: (entityId: string) => void
  watch: (listener: (entityId: string) => void) => Unsubscribe
}

export interface SpecPortDeps {
  sql: () => Promise<SqlContext>
  resource: () => PlanningCardResource
}

export interface TransitionPortDeps {
  sql: () => Promise<SqlContext>
  resource: () => PlanningTransitionResource
  ids: () => string
  now: () => string
  /** The card-seq and entity-key unique index names — how a violation is told apart. */
  indexes: () => Promise<{ cardSeq: string, entityKey: string }>
}
