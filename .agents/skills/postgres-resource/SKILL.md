---
name: postgres-resource
description: How to use @owlmeans/postgres-resource — PostgreSQL-backed Resource implementation. The AJV schema is the single source of truth for the table; structure reconciliation, code migrations, and {{alias}} custom SQL. Auto-invoked when defining a resource backed by PostgreSQL.
user-invocable: false
---

# @owlmeans/postgres-resource

**Layer:** Infra
**Install:** `"@owlmeans/postgres-resource": "^0.1.18-rc.50"` in `dependencies` (peers `pg`, `ajv`)

The Postgres counterpart of [[mongo-resource]]. The difference that governs everything else: a
Mongo collection has no structure, a Postgres table does — so **the resource layer owns the DDL**
and derives it from the resource's AJV schema.

## Key Exports

| Export | Description |
|--------|-------------|
| `makePostgresResource<R, T>(alias, dbAlias?, serviceAlias?, tableName?)` | The resource factory. Aliases default to `DEFAULT_DB_ALIAS` (`'postgres'`); `tableName` overrides the physical table (else the sanitized alias). |
| `PostgresResource<T>` | `Resource<T>` + `table`/`entity`, `db()`/`client()`, `index`, `ref`, `getDefaults`, custom SQL (`query`/`queryOne`/`execute`/`select`/`selectOne`), `transaction`, `insert`/`upsert`/`patch`, `countBy`, `lock`/`unlock`, `migration`/`migrations`. |
| `PostgresDbService`, `PostgresDb`, `PostgresTx` | Service contract implemented by `@owlmeans/postgres`; the db handle `{ drizzle, pool, schema, database }`; the transaction façade (`client`, `query`/`queryOne`/`execute`, `ref`). |
| `PostgresMeta` | The `DbConfig.meta` shape this package reads — `database`, `autoSync`, `url`, and the pool/probe knobs. |
| `TableSpec`, `ColumnSpec`, `PgPropertyOverride`, `PgRootOverride`, `DdlPlan` | The compiled table description and the `pg:` vocabulary types. |
| `PgIndexSpec`, `PgUniqueSpec`, `PgCheckSpec`, `PgReferenceSpec` | What `resource.index()` and the `pg:` overrides are written with. |
| `criteriaToSql`, `sortToSql` | `Criteria<T>` → a WHERE clause and `Sort<T>` → the ORDER BY, for code that builds its own statement over the same table. |
| `pgKeyword` | `{ keyword: 'pg', valid: true }` — register it when running AJV in strict mode. |
| `schemaToTableSpec`, `pgTableName`, `pgIdentifier`, `quoteIdent`, `qualify`, `advisoryKey` | The compiler and identifier helpers. |
| `planSync`, `introspectTable`, `canonicalDefinition` | The reconciliation plan against a live table, the introspection, and the form definitions are compared in. |
| `refOf`, `resolvePlaceholders` | `{{alias}}` resolution — identifiers only. |
| `PostgresError` family, `pgErrorToResourceError`, `describePgError` | Driver-error translation. |
| `getDeclaration`, `resetDeclarations` | Module-scope schema/index/migration declarations, keyed by alias. |
| `DEFAULT_DB_ALIAS`, `DEFAULT_PAGE_SIZE`, `DEF_MIGRATIONS_TABLE`, `PgAutoSync`, `PgIndexMethod`, `PgReferentialAction`, `PgErrorCode` | Constants. |

## The schema is the table — never write DDL

```typescript
export const makeProjectResource: ResourceMaker<ProjectRecord, ProjectResource> = (dbAlias, serviceAlias) => {
  const resource = makePostgresResource<ProjectRecord, ProjectResource>(
    RES_PROJECT, dbAlias, serviceAlias
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

`schema`, `index()` and `migration()` all land in the module-scope declaration for the alias rather
than on the resource object, so a maker that runs more than once for the same alias — a custom
maker wrapping the built-in one, a spec calling it again — reads and extends the same declaration
instead of starting a fresh, emptier one.

| JSON Schema | Postgres |
|---|---|
| `string` · `string`+`format:'uuid'` | `text` · `uuid` |
| `DateSchema` (`{type:'object', format:'date-time'}`) | `timestamptz` |
| `integer` · `number` · `boolean` | `integer` · `double precision` · `boolean` |
| `array` of plain `string`/`integer`/`number`/`boolean` items (no `format`, no `enum`) | native `<scalar>[]`, e.g. `text[]` |
| any other `array` (objects, enums, formatted items, no `items`), nested `object` | `jsonb` |
| string `enum` | `text` + `CHECK` |
| `nullable: true` · in `required[]` | nullable · `NOT NULL` |
| `secure: true` | ciphertext column, `lock`/`unlock` aware |
| `id` property | primary key, `gen_random_uuid()::text` default |

**Thread `nullable` at every recursion level.** Mongo's mapper shipped this bug twice in exactly the
same two places — `date-time` and optional nested objects. Cover both when you touch the mapper.

## Method semantics that differ from the base contract

| Method | Semantics |
|---|---|
| `create` | refuses a caller-supplied id (`RecordExists`) — use `insert`; rejects `opts.ttl` with `UnsupportedArgumentError` (mongo parity) |
| `update` | **replaces** the whole record — use `patch` to merge |
| `load(where, { sort })` / `get(where, { sort })` | one `SELECT … ORDER BY … LIMIT 1`, so "the newest matching row" is one statement rather than a list whose head is taken |
| `delete` / `take` | one `DELETE … RETURNING`: the row is handed back by the statement that removed it. `take` **deletes** and throws `UnknownRecordError` on a miss |
| `purge` | `DELETE … RETURNING` over the criteria; refuses an empty criteria object (`UnsupportedArgumentError('purge:no-criteria')`) rather than truncating the table |
| `count` | `count(*)` over the criteria, no rows carried back |
| `countBy(criteria, fields)` | one `GROUP BY` over the named properties: `[{ ...group values, count }]` (a group value is `null` where absent); refuses no field, a field named `count`, and an unknown property |
| `upsert` | `INSERT … ON CONFLICT DO UPDATE`, conflicting on the primary key by default |
| `select`/`selectOne` | custom SQL marshalled back into `T`; `query`/`queryOne` return raw rows |

## Paging

Postgres is **PAGED**: `DEFAULT_PAGE_SIZE` is `100`, so `list(where)` with no `size` returns the
first 100 rows — a table is unbounded, and an unpaged read is a production incident waiting for the
row count to grow. `total` is counted separately, so it describes the whole match rather than the
window, and `list(where, { size: 0 })` lifts the limit: the explicit, greppable way to read a whole
table.

`sort` becomes the `ORDER BY`, a bare field name ascending, and **the primary key is always
appended as a tiebreak**. Postgres has no implicit row order, so paginating on a non-unique sort
key silently duplicates and skips rows between pages — a difference from mongo that would surface
as a data bug rather than an error.

## Errors

Drizzle raises `DrizzleQueryError` and hangs the `pg` error off `cause`, so the driver `code` is not
at the top level. `pgErrorToResourceError` unwraps (bounded — `cause` chains can be circular) before
classifying, and keeps the original wrapper as `cause`. Unique violation → `RecordExists`, not-null →
`MisshapedRecord`, plus the `Postgres*Error` family. Raw `code`/`detail`/`hint`/`severity` survive
translation — consumers classify retryable DDL races on `42P01`/`42703`.

## Config

`DbConfig.schema` is the Postgres **SCHEMA** (the service's `name(alias?)` returns it as given); the
**DATABASE** comes from `meta.database`. Values starting with `/` are read as files by the existing
`fileConfigReader` middleware.

## Depends On

- `@owlmeans/resource` · `@owlmeans/context` · `@owlmeans/server-context` · `@owlmeans/basic-ids`
- `drizzle-orm` (internal query builder) · peer `pg`, `ajv`

## Related

- [[postgres]] — the connection service this resolves through
- [[resource]] — `Resource<T>`, migrations, the error family · [[mongo-resource]] — the Mongo counterpart

## Parts

| Part | Load it when |
|---|---|
| [overrides](parts/overrides.md) | declaring a column type, index, unique, check or foreign key the schema cannot express |
| [sync](parts/sync.md) | changing a table's shape, adopting an existing table, writing a migration, or a boot that fails on DDL |
| [sql](parts/sql.md) | writing custom SQL or a criteria object over a Postgres resource |
| [testing](parts/testing.md) | adding or running tests for the table compiler, placeholders or criteria rendering |
