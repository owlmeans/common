---
name: postgres-resource
description: How to use @owlmeans/postgres-resource — PostgreSQL-backed Resource implementation. The AJV schema is the single source of truth for the table; structure reconciliation, code migrations, and {{alias}} custom SQL. Auto-invoked when defining a resource backed by PostgreSQL.
user-invocable: false
---

# @owlmeans/postgres-resource

**Layer:** Infra
**Install:** `"@owlmeans/postgres-resource": "^0.1.18-rc.12"` in `dependencies` (peers `pg`, `ajv`)

The Postgres counterpart of [[mongo-resource]]. The difference that governs everything else: a
Mongo collection has no structure, a Postgres table does — so **the resource layer owns the DDL**
and derives it from the resource's AJV schema.

## Key Exports

| Export | Description |
|--------|-------------|
| `makePostgresResource<R, T>(alias, dbAlias?, serviceAlias?, tableName?)` | The resource factory. Aliases default to `DEFAULT_DB_ALIAS` (`'postgres'`); `tableName` overrides the physical table (else the sanitized alias). |
| `PostgresResource<T>` | `Resource<T>` + `table`/`entity`, custom SQL, transactions, `insert`/`upsert`/`patch`, `lock`/`unlock`. |
| `PostgresDbService`, `PostgresDb`, `PostgresTx` | Service contract implemented by `@owlmeans/postgres`; the db handle `{ drizzle, pool, schema, database }`; the transaction façade. |
| `TableSpec`, `ColumnSpec`, `PgPropertyOverride`, `PgRootOverride`, `DdlPlan` | The compiled table description and the `pg:` vocabulary types. |
| `pgKeyword` | `{ keyword: 'pg', valid: true }` — register it when running AJV in strict mode. |
| `schemaToTableSpec`, `pgTableName`, `pgIdentifier`, `quoteIdent`, `qualify`, `advisoryKey` | The compiler and identifier helpers. |
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

**Index and unique specs are deduplicated by resolved name, first declaration wins.** Three
declaration sites merge into one `TableSpec` — the schema root, a per-property override, and
`resource.index()` — and a consumer that declares one index in two of them is expressing a style,
not an error. Two entries under one name would emit the same `CREATE INDEX` twice in a single DDL
transaction, and Postgres answers the second with `42P07`, rolling back the plan that created the
table: the resource then fails every boot with an error naming an index that does not exist.
`byName` in `utils/schema.ts` collapses them and warns.

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

**A retype drops the column's default first and restores it after.** Postgres refuses
`ALTER COLUMN … TYPE` outright when the column carries a DEFAULT it cannot cast to the new type
(`42804 default for column "x" cannot be cast automatically`), and it refuses before reading a
single row, so `USING` never gets a chance to help. Since the plan is one transaction, that refusal
aborts the whole reconciliation and the resource then fails *every* boot with an error naming the
column it is trying to fix. The plan therefore emits `DROP DEFAULT` → `ALTER … TYPE … USING` →
`SET DEFAULT`, restoring the default from the spec rather than from what the column was carrying.
The `id` column is where this shows up in practice: it is created with a `gen_random_uuid()::text`
default, so any change to its declared type takes this path.

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
| `create` | refuses a caller-supplied id (`RecordExists`) — use `insert`; rejects `opts.ttl` with `UnsupportedArgumentError` (mongo parity) |
| `update` | **replaces** the whole record — use `patch` to merge |
| `load(where, { sort })` / `get(where, { sort })` | one `SELECT … ORDER BY … LIMIT 1`, so "the newest matching row" is one statement rather than a list whose head is taken |
| `delete` / `take` | one `DELETE … RETURNING`: the row is handed back by the statement that removed it. `take` **deletes** and throws `UnknownRecordError` on a miss |
| `purge` | `DELETE … RETURNING` over the criteria; refuses an empty criteria object (`UnsupportedArgumentError('purge:no-criteria')`) rather than truncating the table |
| `count` | `count(*)` over the criteria, no rows carried back |
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

## Criteria against a table

`criteriaToSql` answers the shared vocabulary ([[resource]]) in SQL, so one criteria object selects
the same rows here as it does against a collection or in memory. What is specific to a table:

- **A key naming no column raises `UnsupportedArgumentError`.** A typo that silently widened a
  query to the whole table is worth being loud about — the schemaless stores cannot detect one.
- **A dotted key reaches into a jsonb column** (`#>>`), and a criteria object against a jsonb
  column becomes containment (`@>`). A dotted key over a non-jsonb column is refused, and `sort`
  refuses dotted paths outright: ORDER BY names a column the caller actually declared.
- `$contains`/`$contained`/`$overlaps` are the array operators `@>`, `<@` and `&&`;
  `$like`/`$ilike` are `LIKE`/`ILIKE`; `$exists: true` and `$null: false` are `IS NOT NULL`, their
  negations `IS NULL`.
- **`{ $in: [null, …] }` is widened explicitly.** SQL `IN` never matches NULL, so a null in the
  list would silently disappear; the condition becomes `IN (…) OR IS NULL` (and the `$nin` form
  `NOT IN (…) AND IS NOT NULL`), which is what the other stores answer.

## Errors

Drizzle raises `DrizzleQueryError` and hangs the `pg` error off `cause`, so the driver `code` is not
at the top level. `pgErrorToResourceError` unwraps (bounded — `cause` chains can be circular) before
classifying, and keeps the original wrapper as `cause`. Unique violation → `RecordExists`, not-null →
`MisshapedRecord`, plus the `Postgres*Error` family. Raw `code`/`detail`/`hint`/`severity` survive
translation — consumers classify retryable DDL races on `42P01`/`42703`.

## Config

`DbConfig.schema` is the Postgres **SCHEMA** (`dbName()` returns it as given); the **DATABASE** comes
from `meta.database`. Values starting with `/` are read as files by the existing
`fileConfigReader` middleware.

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
