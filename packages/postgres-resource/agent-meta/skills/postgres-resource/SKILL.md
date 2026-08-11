---
name: postgres-resource
description: How to use @owlmeans/postgres-resource — PostgreSQL-backed Resource implementation. The AJV schema is the single source of truth for the table; structure reconciliation, code migrations, and {{alias}} custom SQL. Auto-invoked when defining a resource backed by PostgreSQL.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/postgres-resource

**Layer:** Infra
**Install:** `"@owlmeans/postgres-resource": "^0.1.16-rc.0"` in `dependencies` (peers `pg`, `ajv`)

The Postgres counterpart of [[mongo-resource]]. The difference that governs everything else: a
Mongo collection has no structure, a Postgres table does — so **the resource layer owns the DDL**
and derives it from the resource's AJV schema.

## Key Exports

| Export | Description |
|--------|-------------|
| `makePostgresResource<R, T>(alias, dbAlias?, serviceAlias?, maker?, tableName?)` | The resource factory. Aliases default to `DEFAULT_DB_ALIAS` (`'postgres'`). |
| `PostgresResource<T>` | `Resource<T>` + `table`/`entity`, custom SQL, transactions, `insert`/`upsert`/`patch`/`purge`/`count`, `lock`/`unlock`. |
| `PostgresDbService`, `PostgresDb`, `PostgresTx` | Service contract implemented by `@owlmeans/postgres`; the db handle `{ drizzle, pool, schema, database }`; the transaction façade. |
| `TableSpec`, `ColumnSpec`, `PgPropertyOverride`, `PgRootOverride`, `DdlPlan` | The compiled table description and the `pg:` vocabulary types. |
| `pgKeyword` | `{ keyword: 'pg', valid: true }` — register it when running AJV in strict mode. |
| `schemaToTableSpec`, `pgTableName`, `pgIdentifier`, `quoteIdent`, `qualify`, `advisoryKey` | The compiler and identifier helpers. |
| `refOf`, `resolvePlaceholders` | `{{alias}}` resolution — identifiers only. |
| `PostgresError` family, `pgErrorToResourceError`, `describePgError` | Driver-error translation. |
| `getDeclaration`, `resetDeclarations` | Module-scope index/migration declarations, keyed by alias. |
| `DEFAULT_DB_ALIAS`, `DEFAULT_PAGE_SIZE`, `DEF_MIGRATIONS_TABLE`, `PgAutoSync`, `PgIndexMethod`, `PgReferentialAction`, `PgErrorCode` | Constants. |

## The schema is the table — never write DDL

```typescript
export const makeProjectResource: ResourceMaker<ProjectRecord, ProjectResource> = (dbAlias, serviceAlias) => {
  const resource = makePostgresResource<ProjectRecord, ProjectResource>(
    RES_PROJECT, dbAlias, serviceAlias, makeProjectResource
  )
  resource.schema = ProjectSchema
  resource.index('idx_project_entity', { columns: ['entityId'] })

  return resource
}
context.registerResource(makeProjectResource())
```

Never call `pgTable`/`pgSchema`, never call `drizzle()`, never run `drizzle-kit`, never hand-write
`CREATE TABLE`. Two owners of the same DDL is the failure mode this package exists to remove:
reconciliation would drop what the other owner added.

| JSON Schema | Postgres |
|---|---|
| `string` · `string`+`format:'uuid'` | `text` · `uuid` |
| `DateSchema` (`{type:'object', format:'date-time'}`) | `timestamptz` |
| `integer` · `number` · `boolean` | `integer` · `double precision` · `boolean` |
| `array`, nested `object` | `jsonb` |
| string `enum` | `text` + `CHECK` |
| `nullable: true` · in `required[]` | nullable · `NOT NULL` |
| `secure: true` | ciphertext column, `lock`/`unlock` aware |
| `id` property | primary key, `gen_random_uuid()::text` default |

**Thread `nullable` at every recursion level.** Mongo's mapper shipped this bug twice in exactly the
same two places — `date-time` and optional nested objects. Cover both when you touch the mapper.

## The `pg:` override vocabulary

For what JSON Schema can't say. Per property: `column`, `type`, `length`, `precision`, `scale`,
`nullable`, `default`/`defaultRaw`, `primaryKey`, `unique`, `index`, `references`, `jsonb`, `array`,
`check`, `using`, `managed`, `comment`. At the root: `table`, `schema`, `primaryKey`, `unique`,
`indexes`, `checks`, `unmanaged`, `autoSync`, `comment`.

```typescript
{
  type: 'object',
  properties: {
    email: { type: 'string', pg: { type: 'varchar', length: 320, unique: true } },
    ownerId: { type: 'string', pg: { references: { resource: 'users', onDelete: 'cascade' } } }
  },
  required: ['email'],
  pg: { indexes: [{ name: 'idx_owner_created', columns: ['ownerId', 'createdAt'] }] }
}
```

The compiler reads the raw schema object and never validates through AJV, so `pg:` costs nothing at
runtime — but a consumer compiling that schema in **strict mode** must `ajv.addKeyword(pgKeyword)`.

## Reconciliation is authoritative — `PgAutoSync`

At `init()`: introspect → diff → apply the whole `DdlPlan` in one transaction under
`pg_advisory_xact_lock`, so concurrent replicas don't race. `DbConfig.meta.autoSync`:

| Value | Behaviour |
|---|---|
| `Full` (default) | add / retype+backfill / drop columns, reconcile indexes and constraints |
| `Additive` | add only — never retypes, never drops |
| `Off` | create if absent, otherwise leave alone |

**`Full` DROPs columns the schema doesn't declare.** Adopting a table this package didn't create:
boot once with `Additive`, confirm the plan comes out empty, then flip to `Full`. Columns listed in
`pg.unmanaged` stay outside reconciliation's authority permanently. A cast Postgres cannot perform
raises `PostgresCastRequired` instead of truncating.

## Migrations bracket the sync

`migration`/`migrations()` implement the shared `MigratableResource` capability from
[[resource]] — same contract as mongo.

```typescript
resource.migration('0001-rescue-legacy', async tx => {
  await tx.execute(`UPDATE {{}} SET slug = legacy WHERE slug IS NULL`)
}, MigrationStage.Pre)
```

- `Pre` runs **before** the table is reshaped — the only place to rescue data reconciliation is
  about to drop. `Post` runs **after**, so it can use the new columns.
- On a table this package just created, every declared migration is **baselined** (recorded, not
  executed) — a fresh table is already at head.
- Applied once, in registration order, each in its own transaction, ledgered in
  `_owlmeans_migrations` in the same Postgres schema.
- The checksum fingerprints the function's **source text**. Keep bodies at module scope; a body
  closed over a loop variable fingerprints the wrapper and drifts. An edited applied body raises
  `MigrationConflict`; a throwing one raises `MigrationError` and aborts `init()`.

## Custom SQL: identifiers interpolate, values never

| Placeholder | Resolves to |
|---|---|
| `{{}}` / `{{self}}` | the owning resource's `"schema"."table"` |
| `{{alias}}` | another registered Postgres resource's qualified table |
| `{{alias.property}}` | that resource's qualified column |
| `{{#alias}}` | the bare quoted table name (`ON CONFLICT ON CONSTRAINT`) |
| `{{$}}` | the owning resource's quoted schema |

```typescript
await projects.select(
  `SELECT p.* FROM {{}} p JOIN {{users}} u ON u.id = {{self.ownerId}} WHERE u.active = $1`, [true]
)
```

Postgres cannot bind an identifier as a parameter — that is the entire reason this mechanism exists.
Values have no such excuse: they stay in `params` as `$1..$n`. An unknown alias or property raises
`PostgresPlaceholderError` at parse time.

**Registration order matters here, unlike Mongo.** `{{alias}}` reads the other resource's
*initialized* `table` spec, where mongo's `ref` derives a collection name from config alone. A
foreign key whose target hasn't initialized is queued with `service.defer()` and drained by the
middleware `appendPostgres` installs — use that rather than reordering registrations.

## Method semantics that differ from the base contract

| Method | Semantics |
|---|---|
| `create` | refuses a caller-supplied id (`RecordExists`) — use `insert` |
| `update` | **replaces** the whole record — use `patch` to merge |
| `pick` | `DELETE … RETURNING`: it deletes the record it returns, atomically |
| `load` | rejects `opts.ttl` with `UnsupportedArgumentError` (mongo parity) |
| `upsert` | `INSERT … ON CONFLICT DO UPDATE`, conflicting on the primary key by default |
| `select`/`selectOne` | custom SQL marshalled back into `T`; `query`/`queryOne` return raw rows |

## Errors

Drizzle raises `DrizzleQueryError` and hangs the `pg` error off `cause`, so the driver `code` is not
at the top level. `pgErrorToResourceError` unwraps (bounded — `cause` chains can be circular) before
classifying, and keeps the original wrapper as `cause`. Unique violation → `RecordExists`, not-null →
`MisshapedRecord`, plus the `Postgres*Error` family. Raw `code`/`detail`/`hint`/`severity` survive
translation — consumers classify retryable DDL races on `42P01`/`42703`.

## Config

`DbConfig.schema` is the Postgres **SCHEMA** (layer-suffixed by `dbName()`); the **DATABASE** comes
from `meta.database` and is never suffixed. Values starting with `/` are read as files by the
existing `fileConfigReader` middleware.

## Tests

`bun test ./tests` in the package — unit specs (schema compilation, identifiers, placeholder
resolution, error translation), no gate, no service. Specs that build a real `ServerContext` live in
`@owlmeans/postgres` instead: a devDependency here on its own dependent is a cycle. See
[[testing-integration]].

## Depends On

- `@owlmeans/resource` · `@owlmeans/context` · `@owlmeans/server-context` · `@owlmeans/basic-ids`
- `drizzle-orm` (internal query builder) · peer `pg`, `ajv`

## Related

- [[postgres]] — the connection service this resolves through
- [[resource]] — `Resource<T>`, migrations, the error family · [[mongo-resource]] — the Mongo counterpart
