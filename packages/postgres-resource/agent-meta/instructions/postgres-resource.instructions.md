---
description: "How to use @owlmeans/postgres-resource — PostgreSQL-backed Resource implementation. The AJV schema is the single source of truth for the table; structure reconciliation, code migrations, and {{alias}} custom SQL."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/postgres-resource

**Layer:** Infra
**Install:** `"@owlmeans/postgres-resource": "^0.1.14"` in `dependencies` (peers `pg`, `ajv`)

## Key Exports

| Export | Description |
|--------|-------------|
| `makePostgresResource<R, T>(alias, dbAlias?, serviceAlias?, maker?, tableName?)` | Resource factory; aliases default to `'postgres'` |
| `PostgresResource<T>`, `PostgresTx`, `PostgresDb`, `TableSpec` | Resource, transaction, db handle and compiled table types |
| `pgKeyword` | `{ keyword: 'pg', valid: true }` — register when AJV runs in strict mode |
| `pgErrorToResourceError`, `PostgresError` family | Driver-error translation |
| `PgAutoSync`, `PgErrorCode`, `DEF_MIGRATIONS_TABLE`, `DEFAULT_DB_ALIAS` | Constants |

## Usage

```typescript
const resource = makePostgresResource<ProjectRecord, ProjectResource>(RES_PROJECT, dbAlias, serviceAlias, maker)
resource.schema = ProjectSchema
resource.index('idx_project_entity', { columns: ['entityId'] })
context.registerResource(resource)
```

## Rules

- **The AJV schema is the table.** Never call `pgTable`/`pgSchema`, never call `drizzle()`, never run
  `drizzle-kit`, never hand-write `CREATE TABLE`. Two owners of the same DDL means reconciliation
  drops what the other owner added.
- Express what JSON Schema can't through the `pg:` keyword — per property (`type`, `length`,
  `unique`, `index`, `references`, `check`, `managed`, …) and at the root (`table`, `indexes`,
  `unmanaged`, `autoSync`, …).
- `DbConfig.meta.autoSync` defaults to `Full`, which **DROPs** undeclared columns. Adopt a
  pre-existing table with `Additive` first, confirm an empty plan, then flip to `Full`. Use
  `pg.unmanaged` for columns reconciliation must never touch.
- Thread `nullable` at **every** recursion level of the type mapper — `date-time` and optional nested
  objects are where the Mongo mapper broke twice.
- Migration `Pre` runs before the structure sync (the only place to rescue data a drop would lose),
  `Post` after. Migrations on a freshly created table are baselined, not executed. Keep bodies at
  **module scope** — the checksum fingerprints the function's source text.
- Custom SQL interpolates **identifiers only**: `{{}}`/`{{self}}`, `{{alias}}`, `{{alias.property}}`,
  `{{#alias}}`, `{{$}}`. Values stay in `params` as `$1..$n`.
- `{{alias}}` needs the target resource **initialized** — unlike Mongo's `ref`, which is a pure
  function of config. For foreign keys use `service.defer()`; don't reorder registrations.
- `create` refuses a caller-supplied id (use `insert`); `update` replaces the whole record (use
  `patch`); `pick` deletes the record it returns; `load` rejects `opts.ttl`.
- Drizzle wraps driver errors in `DrizzleQueryError` with the `pg` error on `cause` — classify
  through `pgErrorToResourceError`, never by reading `error.code` off the outer error.
- `DbConfig.schema` is the Postgres SCHEMA; the DATABASE is `meta.database`.
- Unit specs live here; specs building a real `ServerContext` live in `@owlmeans/postgres`.

## Depends On

- `@owlmeans/resource`, `@owlmeans/context`, `@owlmeans/server-context`, `drizzle-orm`, peer `pg`/`ajv`
