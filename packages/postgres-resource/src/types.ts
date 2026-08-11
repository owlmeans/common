import type {
  DbLocker, ListCriteria, ListOptions, MigratableResource, Resource,
  ResourceDbService, ResourceLocker, ResourceRecord
} from '@owlmeans/resource'
import type { AnySchema } from 'ajv'
import type { Pool, PoolClient, QueryResultRow } from 'pg'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { PgAutoSync, PgIndexMethod, PgReferentialAction } from './consts.js'

/**
 * The handle {@link PostgresDbService.db} resolves to. Carries the pool alongside the
 * query builder because structure reconciliation, advisory locking and custom SQL all
 * need a raw session that Drizzle doesn't expose.
 */
export interface PostgresDb {
  /** Drizzle bound to this config alias' pool. */
  drizzle: NodePgDatabase<Record<string, never>>
  pool: Pool
  /** The Postgres SCHEMA — i.e. `service.name(alias)`, layer suffixed. */
  schema: string
  /** The Postgres DATABASE — i.e. `config.meta.database`. Never layer suffixed. */
  database: string
}

export interface PostgresDbService extends ResourceDbService<PostgresDb, Pool>, DbLocker<ResourceRecord> {
  /** Fully qualified `"schema"."table"` of a registered postgres resource. */
  qualify: (resourceAlias: string, configAlias?: string) => string
  /** Parameterised query straight on the pool — `$1` style placeholders, values never interpolated. */
  query: <Row extends QueryResultRow = QueryResultRow>(
    text: string, params?: unknown[], configAlias?: string
  ) => Promise<Row[]>
  transaction: <R>(fn: (tx: PostgresTx) => Promise<R>, configAlias?: string) => Promise<R>
  /**
   * Work held back until every resource has initialized — foreign keys whose target table
   * belongs to a resource whose own `init()` may not have run yet. Drained by the Loading
   * middleware `appendPostgres` registers.
   */
  defer: (configAlias: string, task: () => Promise<void>) => void
  /** Run every task {@link defer} has queued for a config alias, then clear the queue. */
  drain: (configAlias?: string) => Promise<void>
}

/** `DbConfig.meta` shape this package understands. */
export interface PostgresMeta {
  /** Postgres DATABASE. Falls back to the connection user, per libpq. */
  database?: string
  /** Structure reconciliation policy. Defaults to {@link PgAutoSync.Full}. */
  autoSync?: PgAutoSync | `${PgAutoSync}`
  /** Passed straight to `pg.Pool`. */
  ssl?: boolean | Record<string, unknown>
  max?: number
  idleTimeoutMillis?: number
  connectionTimeoutMillis?: number
  statementTimeoutMillis?: number
  /** Attempts of the `SELECT 1` readiness probe. */
  retries?: number
  retryDelayMillis?: number
  /** Whole connection string — wins over host/user/secret when present. */
  url?: string
}

/** Transaction scoped façade handed to migrations and {@link PostgresResource.transaction}. */
export interface PostgresTx {
  client: PoolClient
  /** `{{alias}}` placeholders resolved against the context, `$1..$n` bound. */
  query: <Row extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<Row[]>
  queryOne: <Row extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<Row | null>
  /** Returns the affected row count. */
  execute: (text: string, params?: unknown[]) => Promise<number>
  /** Fully qualified identifier of a registered resource; omit for the owning resource. */
  ref: (resourceAlias?: string) => string
}

export interface PostgresResource<T extends ResourceRecord> extends Resource<T>, ResourceLocker<T>, MigratableResource<PostgresTx> {
  /** Physical table name override. Defaults to the resource alias, sanitized. */
  name?: string
  /** The AJV schema — single source of truth for the table structure. */
  schema?: AnySchema
  /** Compiled table specification. Available once `init()` has run. */
  table: TableSpec
  /** The Drizzle runtime table built from {@link table}. */
  entity: PgRuntimeTable

  db: () => Promise<PostgresDb>
  client: () => Promise<Pool>

  /** Declare an index the JSON schema can't express. Chainable. */
  index: <Type extends PostgresResource<T>>(name: string, spec: PgIndexSpec) => Type

  getDefaults: () => Partial<T>

  /** Raw rows, no marshalling. */
  query: <Row extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<Row[]>
  queryOne: <Row extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<Row | null>
  /** Returns the affected row count. */
  execute: (text: string, params?: unknown[]) => Promise<number>
  /** Rows marshalled back into `T` through the table spec. */
  select: <Type extends T>(text: string, params?: unknown[]) => Promise<Type[]>
  selectOne: <Type extends T>(text: string, params?: unknown[]) => Promise<Type | null>
  /** Fully qualified `"schema"."table"`; pass an alias to reference another resource. */
  ref: (resourceAlias?: string) => string

  transaction: <R>(fn: (tx: PostgresTx) => Promise<R>) => Promise<R>

  /** Create with a caller supplied id — `create()` refuses one, mirroring mongo. */
  insert: <Type extends T>(record: Partial<Type>) => Promise<Type>
  /** `INSERT ... ON CONFLICT (...) DO UPDATE`. Defaults to conflicting on the primary key. */
  upsert: <Type extends T>(record: Partial<Type>, conflict?: string[]) => Promise<Type>
  /** Merge semantics — `update()` replaces the whole record, mirroring mongo's `replaceOne`. */
  patch: <Type extends T>(record: Partial<Type>, opts?: string | { field?: string }) => Promise<Type>
  /** Bulk delete by criteria. Returns the deleted row count. */
  purge: (criteria: ListCriteria) => Promise<number>
  count: (criteria?: ListCriteria | ListOptions) => Promise<number>
}

/** Compiled, database ready description of a resource's table. */
export interface TableSpec {
  alias: string
  /** Postgres namespace. */
  schema: string
  /** Physical table name. */
  table: string
  /** `"schema"."table"` — already quoted. */
  qualified: string
  columns: ColumnSpec[]
  byProperty: Record<string, ColumnSpec>
  byColumn: Record<string, ColumnSpec>
  /** Column names. */
  primaryKey: string[]
  uniques: PgUniqueSpec[]
  checks: PgCheckSpec[]
  indexes: PgIndexSpec[]
  references: PgReferenceSpec[]
  /** Columns reconciliation must never touch. */
  unmanaged: string[]
  autoSync: boolean
  comment?: string
}

export interface ColumnSpec {
  /** JSON schema property name. */
  property: string
  /** Physical column name. */
  column: string
  /** Canonical `format_type` spelling, e.g. `character varying(320)`. */
  sqlType: string
  jsonType: ColumnJsonType
  notNull: boolean
  primaryKey: boolean
  defaultLiteral?: string | number | boolean | null
  /** Raw SQL default expression, e.g. `now()`. */
  defaultRaw?: string
  /** `secure: true` in the JSON schema — the stored value is ciphertext. */
  secure: boolean
  /** Value has to be `JSON.stringify`d on the way in. */
  jsonb: boolean
  /** Postgres array column. */
  array: boolean
  /** `USING` expression for `ALTER COLUMN ... TYPE`. */
  using?: string
  managed: boolean
  comment?: string
}

export type ColumnJsonType =
  'string' | 'number' | 'integer' | 'bigint' | 'boolean' | 'object' | 'array' | 'date' | 'binary' | 'unknown'

/** Per-property `pg` keyword vocabulary. */
export interface PgPropertyOverride {
  column?: string
  /** Raw Postgres type — wins over everything inferred from the JSON schema. */
  type?: string
  length?: number
  precision?: number
  scale?: number
  nullable?: boolean
  default?: string | number | boolean | null
  defaultRaw?: string
  primaryKey?: boolean
  unique?: boolean | string
  index?: boolean | PgIndexSpec | PgIndexSpec[]
  references?: PgReferenceSpec
  jsonb?: boolean
  array?: boolean
  /** `{{col}}` expands to the quoted column name. */
  check?: string
  using?: string
  /** `false` puts the column outside reconciliation's authority. */
  managed?: boolean
  comment?: string
}

/** Root level `pg` keyword vocabulary. */
export interface PgRootOverride {
  table?: string
  schema?: string
  /** Property names forming a composite primary key. */
  primaryKey?: string[]
  unique?: PgUniqueSpec[]
  indexes?: PgIndexSpec[]
  checks?: PgCheckSpec[]
  /** Physical column names reconciliation must leave alone. */
  unmanaged?: string[]
  autoSync?: boolean
  comment?: string
}

export interface PgIndexSpec {
  name?: string
  /** Property names — mapped to physical columns at compile time. */
  columns?: string | string[]
  /** Raw expression index. Wins over `columns`. */
  expression?: string
  unique?: boolean
  method?: PgIndexMethod | `${PgIndexMethod}`
  /** Partial index predicate. */
  where?: string
}

export interface PgUniqueSpec {
  name?: string
  /** Property names. */
  columns: string[]
}

export interface PgCheckSpec {
  name?: string
  expression: string
}

export interface PgReferenceSpec {
  /** Local property holding the key. Filled in by the compiler. */
  property?: string
  /** Resolve the target table from a registered resource alias... */
  resource?: string
  /** ...or name it directly. */
  table?: string
  schema?: string
  /** Target column. Defaults to `id`. */
  column?: string
  name?: string
  onDelete?: PgReferentialAction | `${PgReferentialAction}`
  onUpdate?: PgReferentialAction | `${PgReferentialAction}`
}

/**
 * The Drizzle table object. Deliberately opaque — tables are built at runtime from JSON
 * schemas, so Drizzle's compile time inference has nothing to infer from and every
 * column would be `any` anyway. Cast it at the call site when you need the typed builder.
 */
export type PgRuntimeTable = Record<string, any>

/** One column as Postgres currently reports it. */
export interface LiveColumn {
  name: string
  /** `format_type` output — directly comparable with {@link ColumnSpec.sqlType}. */
  type: string
  notNull: boolean
  defaultExpr: string | null
  identity: string
  generated: string
  ordinal: number
}

export interface LiveIndex {
  name: string
  definition: string
}

export interface LiveConstraint {
  name: string
  /** `p` primary, `u` unique, `f` foreign, `c` check. */
  type: string
  definition: string
}

export interface LiveTable {
  exists: boolean
  columns: LiveColumn[]
  indexes: LiveIndex[]
  constraints: LiveConstraint[]
}

/** One reconciliation step, kept separate from its SQL so it can be logged and explained. */
export interface DdlStatement {
  kind: DdlKind
  /** What the statement touches — column, index or constraint name. */
  target: string
  sql: string
  /** True when applying this loses data. */
  destructive?: boolean
  /** Rows that would be affected, sampled immediately before a destructive step. */
  affected?: number
}

export type DdlKind =
  'create-schema' | 'create-table' | 'add-column' | 'set-default' | 'backfill' | 'alter-type'
  | 'set-not-null' | 'drop-not-null' | 'drop-constraint' | 'add-constraint' | 'drop-index'
  | 'create-index' | 'add-foreign-key' | 'drop-column' | 'comment'

export interface DdlPlan {
  fresh: boolean
  statements: DdlStatement[]
}
