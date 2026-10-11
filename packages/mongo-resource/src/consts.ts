
export const DEFAULT_DB_ALIAS = 'mongo'

/**
 * Page size a `list` call gets when it asks for none. Mongo cannot afford an unbounded read
 * of a collection by omission, so paging is the default here — `list(where, { size: 0 })`
 * asks for the whole result set, explicitly and greppably.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Collection that records which code-registered migrations have already been applied.
 *
 * One ledger per database, which is the right boundary: it sits beside the data its
 * migrations changed, so dropping the database drops the ledger with it.
 */
export const DEF_MIGRATIONS_COLLECTION = '_owlmeans_migrations'

/**
 * How long a replica waits for another replica's in-flight migration before giving up.
 * Bounded because the alternative is a pod that hangs on boot with no diagnostic.
 */
export const DEF_MIGRATION_WAIT = 60000

export const DEF_MIGRATION_POLL = 250

/** `E11000` — the unique index on `(alias, name)` rejecting a second replica's claim. */
export const MONGO_DUPLICATE_KEY = 11000
