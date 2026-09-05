---
name: postgres
description: How to use @owlmeans/postgres — PostgreSQL connection service (makePostgresDbService / appendPostgres) registered on a server context, its health checks, plus the least-privilege bootstrap admin path. Auto-invoked when wiring PostgreSQL into a server app.
user-invocable: false
---

# @owlmeans/postgres

**Layer:** Infra
**Install:** `"@owlmeans/postgres": "^0.1.18-rc.13"` in `dependencies`

Pooled `pg` connections for a server context, plus the admin path that provisions the role, database
and schema an app connects with. All DDL for application tables belongs to [[postgres-resource]] —
this package only creates the schema those tables live in.

## Key Exports

| Export | Description |
|--------|-------------|
| `makePostgresDbService(alias?)` | The connection service. `alias` defaults to `DEFAULT_ALIAS` (`'postgres'`). |
| `appendPostgres(context, alias?)` | Registers the service **and** its drain middleware. Use this, not a bare `registerService`. |
| `PostgresService` | `PostgresDbService` + `bootstrap(configAlias, opts)`. |
| `BootstrapOptions`, `BootstrapReport`, `bootstrapDb` | The admin path. `bootstrapDb(service, configAlias, opts)` is what `service.bootstrap(configAlias, opts)` calls — both read the config through a **context-bound** service, so neither runs outside a context. |
| `pingDb(context, alias?, configAlias?)` / `checkDbHealth(...)` | Health checks through the registered service; `DbHealth` = `{ ok, summary, error? }`. |
| `getLastDbHealth(alias?, configAlias?)` / `formatDbError(error)` | The cached verdict, and the cause-chain error formatter. |
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

**`schema` is the SCHEMA, not the database.** The service's `name(alias?)` returns it as given
(`config.schema ?? config.alias ?? service.alias`), so a separate namespace costs a `CREATE SCHEMA`
inside a shared database rather than a `CREATE DATABASE`. The database comes from `meta.database`.

Other `meta` keys: `autoSync` (see [[postgres-resource]]), `ssl`, `max`, `idleTimeoutMillis`,
`connectionTimeoutMillis`, `statementTimeoutMillis`, `retries`, `retryDelayMillis`.

## What `init()` does

Opens a `pg.Pool` → attaches the pool's `error` handler → `SELECT 1` readiness probe
(`DEF_RETRIES` 30 attempts, `DEF_RETRY_DELAY` 2s apart, both overridable through
`meta.retries`/`meta.retryDelayMillis`) → `SIGTERM` handler that drains the pool → registers the
client → `CREATE SCHEMA IF NOT EXISTS`.

Do **not** hand-roll the retry loop around it: a Postgres sidecar routinely accepts TCP before it
accepts queries, which is precisely what the probe is for. Credential, missing-database and
permission failures (`TERMINAL_CONNECT_CODES`) fail immediately instead of burning the full retry
budget on an error that will never clear. A probe that gives up ends the pool before raising, so a
failed boot leaves no sockets behind.

**The schema is created only when the config entry names one.** `config.schema` absent means no
`CREATE SCHEMA` at all — an entry that identifies its database through `meta.database` or
`meta.url` and omits `schema` gets none, deliberately: resources create the schema they need
anyway, and inventing one from the service alias would leave an empty `postgres` schema behind on
every boot of the admin connection.

**The pool's `error` handler is not optional.** `node-postgres` emits `error` on *idle* clients
whenever the server closes a connection — routine behind a load balancer — and an unhandled
`error` on an EventEmitter terminates the process. The service attaches one that logs; a pool you
open yourself needs the same.

Keep the pool small. Postgres caps connections cluster-wide (`max_connections`, 100 by default), so
an oversized per-process pool starves every other client of the same server — the opposite of the
Mongo driver's tuning instinct.

## Service surface

`db(alias?)` → `{ drizzle, pool, schema, database }` · `client(alias?)` / `clients` ·
`qualify(resourceAlias, configAlias?)` · `query(text, params?, configAlias?)` ·
`transaction(fn, configAlias?)` · `lock`/`unlock` (field encryption through
`makeKeyPairModel(config.encryptionKey)` from `@owlmeans/basic-keys`) ·
`defer(configAlias, task)` / `drain(configAlias?)`.

`defer` exists for work that can't run during one resource's `init()` because it points at another
resource that hasn't initialized yet — foreign keys, above all. Queue it; the middleware
`appendPostgres` registers drains it once the context is up. Do not reorder resource registrations
to work around this.

## Health

Do not hand-roll a health check, and never open a connection of your own for one: `pingDb` and
`checkDbHealth` resolve the service by alias exactly as any other consumer does, so a probe can
never report on a connection the app does not use. Both return `{ ok, summary, error? }` and never
throw.

```typescript
const health = await checkDbHealth(context)          // boot gate, after init()
if (!health.ok) throw new Error(health.error ?? health.summary)

const live = await pingDb(ctx)                       // request time, in a health handler
const boot = getLastDbHealth()
```

`checkDbHealth` awaits `service.ready()`, runs `SELECT 1` and caches its verdict for
`getLastDbHealth`; `pingDb` is the bare `SELECT 1` and caches nothing. Neither inspects the schema
— structure is reconciled by the resources during `init()`, so a process that reached the check has
the tables it was built with and there is nothing left to assert beyond "the connection works".

The context is a parameter, not a module import: a handler is handed the context that actually
served the request (possibly an entity-scoped derivative), and passing it keeps these functions out
of the boot import cycle. Errors go through `formatDbError`, which walks the `cause` chain and
surfaces the `severity`/`code`/`detail`/`hint` a bare `.message` hides — that is where the real
FATAL/permission reason lives.

Pair it with the bind-first boot in [[server-app]]: `checkDbHealth` is the boot gate, and a failure
becomes `setBootPhase('failed', …)` on a port that is already bound.

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
generated the password it just passed in, so the role has to accept it). The two grant branches are
independent: `leastPrivilege` applies `REVOKE CONNECT … FROM PUBLIC`,
`REVOKE CREATE ON SCHEMA public FROM PUBLIC` and `GRANT CONNECT … TO <role>`, while `schema`
applies `CREATE SCHEMA … AUTHORIZATION <role>`, `GRANT ALL ON SCHEMA … TO <role>` and
`ALTER ROLE … SET search_path`. **`search_path` comes from `schema`** — a call with
`leastPrivilege` and no `schema` sets none. The returned `BootstrapReport` says what actually
changed. Identifiers are validated and quoted; the password is the only literal.

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
