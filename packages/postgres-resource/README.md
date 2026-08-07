# @owlmeans/postgres-resource

PostgreSQL-backed `Resource<T>` implementation — schema-driven tables, structure reconciliation,
code-registered migrations, and custom SQL with resource-alias placeholders.

## Overview

- `makePostgresResource<R, T>(alias, dbAlias?, serviceAlias?, maker?, tableName?)` — factory for Postgres resources
- `PostgresResource<T>` — extends `Resource<T>` with a Drizzle table, custom SQL, transactions, and field encryption
- The resource's **AJV schema is the single source of truth for the table structure** — columns, types,
  nullability, defaults, primary key and indexes are all derived from it
- A `pg:` keyword vocabulary inside that schema covers what JSON Schema can't express: column types and
  lengths, foreign keys, composite indexes, checks, partial indexes
- Tables are created and reconciled automatically at `init()`; migrations run around that in `pre`/`post` stages

## Installation

```bash
bun add @owlmeans/postgres-resource @owlmeans/postgres pg
```

`pg` and `ajv` are peer dependencies of this package. `@owlmeans/postgres` provides the connection
service this package resolves through.

## Usage

Define a resource:

```typescript
import { makePostgresResource } from '@owlmeans/postgres-resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import type { ResourceMaker } from '@owlmeans/resource'

export interface ProjectResource extends PostgresResource<ProjectRecord> {}

export const makeProjectResource: ResourceMaker<ProjectRecord, ProjectResource> = (dbAlias, serviceAlias) => {
  const resource = makePostgresResource<ProjectRecord, ProjectResource>(
    RES_PROJECT, dbAlias, serviceAlias, makeProjectResource
  )
  resource.schema = ProjectSchema
  resource.index('idx_project_entity', { columns: ['entityId'] })

  return resource
}
```

Register in context:

```typescript
context.registerResource(makeProjectResource())
```

Use in a handler:

```typescript
const projects = context.resource<ProjectResource>(RES_PROJECT)
const record = await projects.create({ entityId, alias, title })
const list = await projects.list({ criteria: { entityId } })
```

### Schema → table

```typescript
const ProjectSchema: JSONSchemaType<ProjectRecord> = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', pg: { type: 'varchar', length: 320, unique: true } },
    ownerId: { type: 'string', pg: { references: { resource: 'users', onDelete: 'cascade' } } },
    payload: { type: 'object', nullable: true },          // → jsonb
    createdAt: DateSchema                                  // → timestamptz
  },
  required: ['id', 'email'],
  pg: {
    table: 'app_projects',
    indexes: [{ name: 'idx_owner_created', columns: ['ownerId', 'createdAt'] }]
  }
}
```

| JSON Schema | Postgres |
|---|---|
| `string` | `text` |
| `string` + `format: 'uuid'` | `uuid` |
| `DateSchema` (`{type:'object', format:'date-time'}`) | `timestamptz` |
| `integer` / `number` / `boolean` | `integer` / `double precision` / `boolean` |
| `array`, nested `object` | `jsonb` |
| string `enum` | `text` + `CHECK` |
| `nullable: true` | nullable column |
| in `required[]` | `NOT NULL` |
| `secure: true` | ciphertext column, `lock`/`unlock` aware |
| `id` property | primary key, `gen_random_uuid()::text` default |

AJV in strict mode rejects unknown keywords — register `pgKeyword` to allow `pg:`:

```typescript
ajv.addKeyword(pgKeyword)
```

### Structure reconciliation

At `init()` the resource introspects `information_schema` / `pg_catalog`, diffs against the compiled
spec, and applies the DDL plan in one transaction under a `pg_advisory_xact_lock`, so concurrent
replicas never race. Policy comes from `DbConfig.meta.autoSync`:

| `PgAutoSync` | Behaviour |
|---|---|
| `Full` (default) | add / retype / backfill / drop columns, reconcile indexes and constraints |
| `Additive` | add only — never retypes, never drops. The adoption path for a pre-existing table |
| `Off` | create the table if absent, otherwise leave it alone |

A cast Postgres cannot perform raises `PostgresCastRequired` rather than truncating data. Columns
listed in `pg.unmanaged` are outside reconciliation's authority entirely.

### Migrations

```typescript
resource.migration('0001-backfill-slug', async tx => {
  await tx.execute(`UPDATE {{}} SET slug = lower(title) WHERE slug IS NULL`)
}, MigrationStage.Post)
```

Stages bracket the structure sync: `Pre` runs **before** the table is reshaped (so a migration can
rescue data reconciliation would drop), `Post` **after** (so it can use the new columns). Applied
once, in registration order, each in its own transaction, recorded in `_owlmeans_migrations`.
Migrations declared on a table this package just created are **baselined**, not executed. An edited
body raises `MigrationConflict`; a failing one raises `MigrationError` and aborts `init()`.

### Custom SQL

Placeholders resolve **identifiers only** — values stay in `params` and are bound as `$1..$n`:

| Placeholder | Resolves to |
|---|---|
| `{{}}` / `{{self}}` | the owning resource's `"schema"."table"` |
| `{{alias}}` | another registered Postgres resource's qualified table |
| `{{alias.property}}` | that resource's qualified column |
| `{{#alias}}` | the bare quoted table name (for `ON CONFLICT ON CONSTRAINT`) |
| `{{$}}` | the owning resource's quoted schema |

```typescript
const rows = await projects.select(
  `SELECT p.* FROM {{}} p JOIN {{users}} u ON u.id = {{self.ownerId}} WHERE u.active = $1`,
  [true]
)
```

An unknown alias or property raises `PostgresPlaceholderError` at parse time rather than being
substituted blindly.

## API

### `makePostgresResource<R, T>(alias, dbAlias?, serviceAlias?, maker?, tableName?): T`

Creates a Postgres resource. `dbAlias` and `serviceAlias` default to `DEFAULT_DB_ALIAS`
(`'postgres'`). `tableName` overrides the physical table name, which otherwise derives from the alias.

### `PostgresResource<T>`

Extends `Resource<T>` with:

- `schema?: AnySchema` — the source of truth for the table structure
- `table: TableSpec` / `entity: PgRuntimeTable` — the compiled spec and the runtime Drizzle table
- `db(): Promise<PostgresDb>` / `client(): Promise<Pool>`
- `index(name, spec): this` / `migration(name, apply, stage?): this` — chainable declarations
- `query` / `queryOne` / `execute` — raw rows and affected counts
- `select` / `selectOne` — rows marshalled back into `T`
- `ref(alias?): string` — fully qualified identifier of this or another resource
- `transaction(fn)` — a `PostgresTx` with the same placeholder-aware helpers
- `insert` / `upsert` / `patch` / `purge` / `count` — beyond the base contract
- `lock(record, fields?)` / `unlock(record, fields?)` — encrypt/decrypt `secure` fields
- `getDefaults(): Partial<T>`

### `Resource<T>` methods (all implemented)

`get`, `load`, `create`, `update`, `save`, `delete`, `pick`, `list`

`create` refuses a caller-supplied id (use `insert`); `update` replaces the whole record (use `patch`
to merge); `pick` deletes the record it returns, atomically.

### Errors

`PostgresError` and its subclasses — `PostgresSyncError`, `PostgresCastRequired`,
`PostgresConstraintError`, `PostgresForeignKeyError`, `PostgresCheckError`, `PostgresDeadlockError`,
`PostgresPlaceholderError`, `PostgresConnectionError`, `PostgresBootstrapError`. Driver errors are
translated by `pgErrorToResourceError`, which unwraps Drizzle's `DrizzleQueryError` to reach the
`pg` error underneath and preserves the raw `code`/`detail`/`hint`/`severity`. Unique violations
surface as `RecordExists` and not-null violations as `MisshapedRecord`.

### Constants

- `DEFAULT_DB_ALIAS` — `'postgres'`
- `DEFAULT_PAGE_SIZE` — `10`
- `DEF_MIGRATIONS_TABLE` — `'_owlmeans_migrations'`
- `PG_KEYWORD` — `'pg'`; `PG_MAX_IDENTIFIER` — `63`
- `PgAutoSync`, `PgIndexMethod`, `PgReferentialAction`, `PgErrorCode`

## Related Packages

- [`@owlmeans/resource`](../resource) — `Resource<T>`, `ResourceRecord`, migrations, error family
- [`@owlmeans/postgres`](../postgres) — the connection service required by this package
- [`@owlmeans/mongo-resource`](../mongo-resource) — the MongoDB counterpart

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
