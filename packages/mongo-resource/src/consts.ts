
export const DEFAULT_DB_ALIAS = 'mongo'

export const DEFAULT_PAGE_SIZE = 10

/**
 * Collection that records which code-registered migrations have already been applied.
 *
 * One ledger per database, which is the right boundary: `dbName()` already varies the
 * database per Entity/User layer, so a tenant's migrations are tracked with the tenant's
 * data and dropping the database drops the ledger with it.
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
