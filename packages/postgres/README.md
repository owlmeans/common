# @owlmeans/postgres

PostgreSQL service for OwlMeans server contexts — pooled connections, readiness probing, schema
provisioning, and an opt-in least-privilege bootstrap path.

## Overview

- `makePostgresDbService(alias?)` — creates a PostgreSQL connection service
- `appendPostgres(context, alias?)` — registers the service **and** its drain middleware in the context
- Reads connection config from `context.cfg.dbs` entries whose `service` is `'postgres'`
- Backs `@owlmeans/postgres-resource`; the resource layer owns all DDL
- `bootstrap()` provisions a role, database and schema from a separate superuser config alias

## Installation

```bash
bun add @owlmeans/postgres @owlmeans/postgres-resource
```

## Usage

```typescript
import { appendPostgres, DEFAULT_ALIAS as POSTGRES_SERVICE } from '@owlmeans/postgres'

// In context setup (backend/src/context.ts)
appendPostgres<C, T>(context)
```

Config:

```typescript
cfg.dbs = [{
  service: 'postgres',
  alias: 'postgres',
  host: '/etc/app-config/pg-host',            // values starting with `/` are read as files
  user: '/etc/app-config/pg-role-name',
  secret: '/etc/master-secret/pg-app-password',
  schema: 'app',                               // ← Postgres SCHEMA
  meta: { database: '/etc/app-config/pg-db-name' }
}]
```

A whole connection string works too, and wins over `host`/`user`/`secret`:

```typescript
cfg.dbs = [{ service: 'postgres', alias: 'postgres', schema: 'app', meta: { url: process.env.DATABASE_URL } }]
```

`schema` is the Postgres **schema**, not the database — `dbName()` suffixes it per Entity/User layer,
so per-tenant namespaces stay cheap. The database comes from `meta.database` and is never suffixed.

At `init()` the service opens a pool, runs a `SELECT 1` readiness probe (30 attempts, 2s apart by
default — a Postgres sidecar routinely accepts TCP before it accepts queries), issues
`CREATE SCHEMA IF NOT EXISTS`, and installs a `SIGTERM` handler that drains the pool.

### Bootstrap (admin path)

Hold the superuser connection under a **separate** config alias so the application's own entry never
carries superuser credentials:

```typescript
cfg.dbs = [
  { service: 'postgres', alias: 'postgres',  /* least privileged app role */ },
  { service: 'postgres', alias: 'pg-admin', /* superuser */ }
]

const postgres = context.service<PostgresService>('postgres')
await postgres.bootstrap('pg-admin', {
  role: 'app_role', password: appPassword, database: 'app_db', schema: 'app', leastPrivilege: true
})
```

Idempotent by design — it probes `pg_roles` and `pg_database` before creating anything, rotates the
password of a role that already exists, and applies `REVOKE CONNECT … FROM PUBLIC`,
`REVOKE CREATE ON SCHEMA public FROM PUBLIC`, `GRANT CONNECT … TO <role>` and
`ALTER ROLE … SET search_path`. Returns a `BootstrapReport` saying what it actually changed.
Identifiers are validated and quoted; the password is the only literal and is escaped.

## API

### `makePostgresDbService(alias?): PostgresService`

Creates the PostgreSQL service. `alias` defaults to `DEFAULT_ALIAS` (`'postgres'`).

### `appendPostgres<C, T>(context, alias?): T`

Registers the service and the drain middleware in the context.

### `PostgresService`

Extends `PostgresDbService` from `@owlmeans/postgres-resource`:

- `db(alias?): Promise<PostgresDb>` — `{ drizzle, pool, schema, database }`
- `client(alias?): Promise<Pool>` / `clients: Record<string, Pool>`
- `qualify(resourceAlias, configAlias?): string` — `"schema"."table"` of a registered resource
- `query(text, params?, configAlias?)` — parameterised query straight on the pool
- `transaction(fn, configAlias?)` — a `PostgresTx`
- `defer(configAlias, task)` / `drain(configAlias?)` — work held back until every resource has
  initialized (foreign keys whose target table belongs to a resource that hasn't run `init()` yet)
- `lock` / `unlock` — AES field encryption via `config.encryptionKey`
- `bootstrap(configAlias, opts): Promise<BootstrapReport>`

### Helpers

- `parseUrl(url)` / `prepareConfig(config, overrides?)` / `poolDatabase(pool)`
- `probe(pool, meta, location)` / `ensureSchema(pool, schema)`
- `bootstrapDb(...)` — the bootstrap implementation, usable without a context
- `drainMiddleware(alias?)`

### Constants

- `DEFAULT_ALIAS` — `'postgres'`
- `DEF_ADMIN_ALIAS` — `'pg-admin'`
- `DEF_MAINTENANCE_DB` — `'postgres'`; `DEF_PORT` — `5432`; `DEF_POOL_SIZE` — `10`
- `DEF_RETRIES` — `30`; `DEF_RETRY_DELAY` — `2000`
- `TERMINAL_CONNECT_CODES` — auth/database/permission failures the probe treats as final

## Related Packages

- [`@owlmeans/postgres-resource`](../postgres-resource) — `makePostgresResource` uses this service
- [`@owlmeans/server-app`](../server-app) — `makeContext` in conjunction with `appendPostgres`
- [`@owlmeans/mongo`](../mongo) — the MongoDB counterpart

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded Claude Code skills and GitHub Copilot instructions under
`agent-meta/`. After installing your `@owlmeans/*` packages, run the OwlMeans
agent-skills installer to place them into your project's native locations
(`.claude/skills/` and `.github/instructions/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
