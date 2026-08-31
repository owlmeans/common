import { DEFAULT_DB_ALIAS } from '@owlmeans/postgres-resource'

export const DEFAULT_ALIAS = DEFAULT_DB_ALIAS

/**
 * Config alias conventionally holding the superuser connection the admin path needs.
 * Never the same as {@link DEFAULT_ALIAS} — the application connects as a least
 * privileged role and must not carry superuser credentials in the same config entry.
 */
export const DEF_ADMIN_ALIAS = 'pg-admin'

/** The database `CREATE DATABASE` has to be issued from, since it can't create the one it's in. */
export const DEF_MAINTENANCE_DB = 'postgres'

export const DEF_PORT = 5432

/**
 * `SELECT 1` readiness probe, generalized from the boot loop every OwlMeans deployment
 * hand-rolled: a Postgres sidecar routinely accepts TCP before it accepts queries.
 */
export const DEF_RETRIES = 30
export const DEF_RETRY_DELAY = 2000

/**
 * Postgres caps connections cluster wide (`max_connections`, 100 by default), so the
 * per-process pool stays deliberately small — unlike a Mongo driver pool, an oversized
 * one here starves every other client of the same server.
 */
export const DEF_POOL_SIZE = 10

/**
 * Failures the readiness probe treats as final rather than as "not up yet":
 * `28P01`/`28000` wrong credentials, `3D000` no such database, `42501` no rights.
 * Retrying any of them just delays the same error by a minute.
 */
export const TERMINAL_CONNECT_CODES = ['28P01', '28000', '3D000', '42501']
