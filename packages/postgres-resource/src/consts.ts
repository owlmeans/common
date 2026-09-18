
export const DEFAULT_DB_ALIAS = 'postgres'

/**
 * Rows `list()` returns when the caller names no `size`.
 *
 * A relational table is unbounded, so an unpaged read is a production incident waiting for
 * the row count to grow. Asking for everything stays possible — and greppable — as
 * `list(where, { size: 0 })`.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Table that records which code-registered migrations have already been applied.
 * Lives in the same Postgres schema as the resources it tracks, so dropping the
 * schema drops the ledger with it.
 */
export const DEF_MIGRATIONS_TABLE = '_owlmeans_migrations'

/** JSON Schema keyword carrying the Postgres specific overrides. */
export const PG_KEYWORD = 'pg'

/** Postgres `NAMEDATALEN - 1`. Identifiers past this are silently truncated by the server. */
export const PG_MAX_IDENTIFIER = 63

/** Property name that carries the record identity across every OwlMeans resource. */
export const ID_FIELD = 'id'

/** Fallback when a scalar property can't be mapped to anything more specific. */
export const DEF_SQL_TYPE = 'text'

export const DEF_JSON_TYPE = 'jsonb'

/** Server side identity default for the implicit `id` primary key. */
export const DEF_ID_DEFAULT = 'gen_random_uuid()::text'

/**
 * How far structure reconciliation is allowed to go.
 *
 * `additive` is the adoption path for a table this package didn't create: it adds what's
 * missing but never retypes and never drops, so a first boot against an existing schema
 * converges without touching data. Flip to `full` once the plan comes out empty.
 */
export enum PgAutoSync {
  Full = 'full',
  Additive = 'additive',
  Off = 'off'
}

export enum PgIndexMethod {
  BTree = 'btree',
  Hash = 'hash',
  Gin = 'gin',
  Gist = 'gist',
  Brin = 'brin',
  SpGist = 'spgist'
}

export enum PgReferentialAction {
  NoAction = 'no action',
  Restrict = 'restrict',
  Cascade = 'cascade',
  SetNull = 'set null',
  SetDefault = 'set default'
}

/**
 * Postgres error codes the resource layer translates into framework errors. Sourced
 * from the `pg` driver's `DatabaseError.code`.
 */
export enum PgErrorCode {
  UniqueViolation = '23505',
  ForeignKeyViolation = '23503',
  NotNullViolation = '23502',
  CheckViolation = '23514',
  UndefinedTable = '42P01',
  UndefinedColumn = '42703',
  DuplicateTable = '42P07',
  DuplicateColumn = '42701',
  DuplicateObject = '42710',
  CannotCoerce = '42846',
  DatatypeMismatch = '42804',
  InvalidTextRepresentation = '22P02',
  StringDataRightTruncation = '22001',
  NumericValueOutOfRange = '22003',
  SerializationFailure = '40001',
  DeadlockDetected = '40P01',
  NoActiveTransaction = '25001'
}

/**
 * Postgres reports scalar values of these types as strings to avoid precision loss.
 * The marshaller converts them back using the resource's schema.
 */
export const STRING_RETURNING_TYPES = ['numeric', 'bigint', 'int8', 'decimal', 'money'] as const

/** Built-in type OIDs the marshaller has to name to reach the driver's own parsers. */
export enum PgTypeOid {
  Date = 1082,
  Timestamp = 1114,
  TimestampTz = 1184
}
