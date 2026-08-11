---
name: postgres
description: How to use @owlmeans/postgres — PostgreSQL connection service (makePostgresDbService / appendPostgres) registered on a server context, plus the least-privilege bootstrap admin path. Auto-invoked when wiring PostgreSQL into a server app.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/postgres

**Layer:** Infra
**Install:** `"@owlmeans/postgres": "^0.1.16-rc.0"` in `dependencies`

Pooled `pg` connections for a server context, plus the admin path that provisions the role, database
and schema an app connects with. All DDL for application tables belongs to [[postgres-resource]] —
this package only creates the schema those tables live in.

## Key Exports

| Export | Description |
|--------|-------------|
| `makePostgresDbService(alias?)` | The connection service. `alias` defaults to `DEFAULT_ALIAS` (`'postgres'`). |
| `appendPostgres(context, alias?)` | Registers the service **and** its drain middleware. Use this, not a bare `registerService`. |
| `PostgresService` | `PostgresDbService` + `bootstrap(configAlias, opts)`. |
| `BootstrapOptions`, `BootstrapReport`, `bootstrapDb` | The admin path; `bootstrapDb` is usable without a context. |
| `drainMiddleware(alias?)` | Drains work deferred until every resource has initialized. |
| `parseUrl`, `prepareConfig`, `poolDatabase`, `probe`, `ensureSchema` | Config and connection helpers. |
| `DEFAULT_ALIAS`, `DEF_ADMIN_ALIAS`, `DEF_MAINTENANCE_DB`, `DEF_PORT`, `DEF_POOL_SIZE`, `DEF_RETRIES`, `DEF_RETRY_DELAY`, `TERMINAL_CONNECT_CODES` | Constants. |

## Wiring

```typescript
import { appendPostgres } from '@owlmeans/postgres'

appendPostgres<C, T>(context)
```

```typescript
cfg.dbs = [{
  service: 'postgres',
  alias: 'postgres',
  host: '/etc/app-config/pg-host',          // a leading `/` means "read this file"
  user: '/etc/app-config/pg-role-name',
  secret: '/etc/master-secret/pg-app-password',
  schema: 'app',                             // ← Postgres SCHEMA
  meta: { database: '/etc/app-config/pg-db-name' }
}]
```

`meta.url` takes a whole connection string and wins over `host`/`user`/`secret` — that is the shape
for a `DATABASE_URL` env var. Because a leading `/` is auto-read, moving to file-mounted secrets
later is a config change, not a code change.

**`schema` is the SCHEMA, not the database.** `dbName()` suffixes it per Entity/User layer, so
per-tenant namespaces cost a `CREATE SCHEMA` rather than a `CREATE DATABASE`. The database comes
from `meta.database` and is never suffixed.

Other `meta` keys: `autoSync` (see [[postgres-resource]]), `ssl`, `max`, `idleTimeoutMillis`,
`connectionTimeoutMillis`, `statementTimeoutMillis`, `retries`, `retryDelayMillis`.

## What `init()` does

Opens a `pg.Pool` → `SELECT 1` readiness probe (30 attempts, 2s apart) → `CREATE SCHEMA IF NOT
EXISTS` → `SIGTERM` handler that drains the pool. Do **not** hand-roll the retry loop around it: a
Postgres sidecar routinely accepts TCP before it accepts queries, which is precisely what the probe
is for. Credential, missing-database and permission failures (`TERMINAL_CONNECT_CODES`) fail
immediately instead of burning the full retry budget on an error that will never clear.

Keep the pool small. Postgres caps connections cluster-wide (`max_connections`, 100 by default), so
an oversized per-process pool starves every other client of the same server — the opposite of the
Mongo driver's tuning instinct.

## Service surface

`db(alias?)` → `{ drizzle, pool, schema, database }` · `client(alias?)` / `clients` ·
`qualify(resourceAlias, configAlias?)` · `query(text, params?, configAlias?)` ·
`transaction(fn, configAlias?)` · `lock`/`unlock` (AES via `config.encryptionKey`) ·
`defer(configAlias, task)` / `drain(configAlias?)`.

`defer` exists for work that can't run during one resource's `init()` because it points at another
resource that hasn't initialized yet — foreign keys, above all. Queue it; the middleware
`appendPostgres` registers drains it once the context is up. Do not reorder resource registrations
to work around this.

## Bootstrap — the admin path

Superuser credentials belong to a **separate config alias**. The application's own entry connects as
the least-privileged role and must never carry them.

```typescript
await context.service<PostgresService>('postgres').bootstrap('pg-admin', {
  role: 'app_role', password: appPassword, database: 'app_db', schema: 'app', leastPrivilege: true
})
```

Idempotent by design — every OwlMeans deployment calls it on each start and each rebuild. It probes
`pg_roles` / `pg_database` before creating, rotates the password of an existing role (the caller
generated the password it just passed in, so the role has to accept it), and with `leastPrivilege`
applies `REVOKE CONNECT … FROM PUBLIC`, `REVOKE CREATE ON SCHEMA public FROM PUBLIC`,
`GRANT CONNECT … TO <role>`, `ALTER ROLE … SET search_path`. The returned `BootstrapReport` says
what actually changed. Identifiers are validated and quoted; the password is the only literal.

**This replaces hand-written bootstrap SQL.** If you find `CREATE ROLE` / `CREATE DATABASE` /
`GRANT` strings in a deployment script, a provisioner, or a `DEPLOYMENT.md`, they are a duplicate of
this function — collapse them into a `bootstrap()` call rather than keeping both in step.

## Tests

`bun test ./tests` in the package. Integration specs that build a real `ServerContext` live **here**,
not in `postgres-resource` — see [[testing-integration]]. Gated on `POSTGRES_URL`; the bootstrap
specs additionally probe for `CREATEROLE`/`CREATEDB` and self-skip without them.

## Depends On

- `@owlmeans/postgres-resource` · `@owlmeans/resource` · `@owlmeans/context` ·
  `@owlmeans/server-context` · `@owlmeans/basic-keys`
- `pg` · `drizzle-orm`

## Related

- [[postgres-resource]] — the `Resource<T>` implementation this service backs
- [[mongo]] — the MongoDB counterpart · [[kluster]] — `kluster:` directives in `cfg.dbs`
