---
description: "How to use @owlmeans/postgres — PostgreSQL connection service (makePostgresDbService / appendPostgres) registered on a server context, plus the least-privilege bootstrap admin path."
applyTo: "**/context.ts, **/config.ts, **/*.ts, **/*.tsx"
---

# @owlmeans/postgres

**Layer:** Infra
**Install:** `"@owlmeans/postgres": "^0.1.14"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makePostgresDbService(alias?)` | PostgreSQL connection service factory |
| `appendPostgres(context, alias?)` | Registers the service **and** its drain middleware |
| `PostgresService`, `BootstrapOptions`, `BootstrapReport` | Service contract and the admin path |
| `bootstrapDb`, `drainMiddleware`, `parseUrl`, `prepareConfig`, `probe`, `ensureSchema` | Helpers |
| `DEFAULT_ALIAS` (`'postgres'`), `DEF_ADMIN_ALIAS` (`'pg-admin'`), `DEF_POOL_SIZE`, `DEF_RETRIES` | Constants |

## Usage

```typescript
import { appendPostgres } from '@owlmeans/postgres'
appendPostgres<C, T>(context)

cfg.dbs = [{
  service: 'postgres', alias: 'postgres',
  host: '/etc/app-config/pg-host', user: '/etc/app-config/pg-role-name',
  secret: '/etc/master-secret/pg-app-password',
  schema: 'app', meta: { database: '/etc/app-config/pg-db-name' }
}]
```

## Rules

- Use `appendPostgres`, not a bare `registerService` — the drain middleware is half the wiring.
- `DbConfig.schema` is the Postgres **SCHEMA** (layer-suffixed by `dbName()`); the **DATABASE** is
  `meta.database` and is never suffixed. `meta.url` accepts a whole connection string and wins over
  `host`/`user`/`secret`. A value starting with `/` is read as a file.
- `init()` already probes readiness (`SELECT 1`, 30×2s) and creates the schema — do not hand-roll a
  retry loop. Auth / missing-database / permission codes fail fast instead of retrying.
- Keep the pool small; `max_connections` is a cluster-wide cap, so an oversized pool starves other
  clients. Default `DEF_POOL_SIZE` is 10.
- All application-table DDL belongs to `@owlmeans/postgres-resource`. This service only creates the
  schema.
- Superuser credentials go under a **separate** config alias (`pg-admin`), never the app's own entry.
- `bootstrap()` is idempotent and replaces hand-written `CREATE ROLE` / `CREATE DATABASE` / `GRANT`
  SQL. If such SQL exists in a deployment script or doc, collapse it into a `bootstrap()` call.
- Use `defer()` for work that depends on another resource being initialized (foreign keys); it is
  drained by the middleware once the context is up.

## Depends On

- `@owlmeans/postgres-resource`, `@owlmeans/resource`, `@owlmeans/context`,
  `@owlmeans/server-context`, `@owlmeans/basic-keys`, `pg`, `drizzle-orm`
