# @owlmeans/postgres-resource

PostgreSQL-backed `Resource<T>`, and the default store for the records a product owns and queries:
users, orders, projects, invoices, settings, audit rows. The resource's AJV schema is the single
source of truth for the table, and the package creates and reconciles that table at boot. It also
runs code migrations around the reconciliation and resolves resource-alias placeholders in custom
SQL. Other stores fit other shapes:
- [`@owlmeans/mongo-resource`](../mongo-resource): documents whose shape varies per record and are read whole.
- [`@owlmeans/redis-resource`](../redis-resource): data defined by expiry, a lock, a counter or fan-out.
- [`@owlmeans/storage-resource`](../storage-resource): file bytes. The record describing the file stays here.
- [`@owlmeans/state`](../state): client-side records.

## Installation

```bash
bun add @owlmeans/postgres-resource@^0.1.18-rc.28 @owlmeans/postgres@^0.1.18-rc.28 pg
```

`pg` and `ajv` are peer dependencies of this package. `@owlmeans/postgres` provides the connection
service this package resolves through.

## Concepts

- **The schema is the table**: columns, types, nullability, defaults, primary key, indexes and
  foreign keys all derive from `resource.schema`. Nothing else writes DDL: no `pgTable`, no
  `drizzle-kit`, no hand-written `CREATE TABLE`.
- **`pg:` overrides**: a keyword inside the schema for what JSON Schema cannot say. That covers
  column type and length, `unique`, `references`, composite indexes, checks, `unmanaged` columns
  and per-table `autoSync`.
- **Reconciliation** (`PgAutoSync`): at `init()` the resource introspects the live table, diffs it
  against the compiled `TableSpec` and applies the DDL plan in one transaction under an advisory
  lock. `Full` adds, retypes and drops. `Additive` only adds. `Off` emits no DDL.
- **Migrations**: code bodies registered with `migration(name, apply, stage?)`. `Pre` runs before
  reconciliation and can rescue data it would drop. `Post` runs after it and can use new columns.
  Each runs once, in its own transaction, recorded in `_owlmeans_migrations`.
- **Placeholders**: `{{}}`, `{{alias}}`, `{{alias.property}}`, `{{#alias}}` and `{{$}}` resolve
  *identifiers only* in custom SQL. Values always travel as `$1..$n` parameters.
- **Paged by default**: `list(where)` returns at most `DEFAULT_PAGE_SIZE` (100) rows, with the
  primary key appended to every sort as a tiebreak.

## Usage

### Define and register a resource

```ts
import { makePostgresResource } from '@owlmeans/postgres-resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import type { ResourceMaker } from '@owlmeans/resource'

export interface ProjectResource extends PostgresResource<ProjectRecord> {}

export const makeProjectResource: ResourceMaker<ProjectRecord, ProjectResource> = (dbAlias, serviceAlias) => {
  const resource = makePostgresResource<ProjectRecord, ProjectResource>(
    RES_PROJECT, dbAlias, serviceAlias
  )
  resource.schema = ProjectSchema
  resource.index('idx_project_entity', { columns: ['entityId'] })

  return resource
}

// in the server context factory, next to appendPostgres(context)
context.registerResource(makeProjectResource())
```

### Read and write from a handler

```ts
const projects = context.resource<ProjectResource>(RES_PROJECT)
const record = await projects.create({ entityId, alias, title })     // the database assigns the id

const one = await projects.load({ entityId, alias })                  // null when absent
const { items, total } = await projects.list(
  { entityId, status: ['draft', 'active'] },                          // an array means "any of these"
  { page: 0, size: 20, sort: [{ field: 'createdAt', order: 'desc' }] }
)

await projects.patch({ id: record.id, status: 'active' })             // merge
await projects.update({ ...record, title: 'Renamed' })                // replace the whole row
```

`size` defaults to `DEFAULT_PAGE_SIZE` (100); `list(where, { size: 0 })` lifts the limit. `total`
always describes the whole match, independently of the page. `entityId` is the organization's
stable record id from `requireEntityKey(req)`, never a value read off the token.

### Schema to table

```ts
import { DateSchema } from '@owlmeans/auth'
import type { JSONSchemaType } from 'ajv'

const InvoiceSchema: JSONSchemaType<InvoiceRecord> = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },                          // primary key; never in required
    entityId: { type: 'string' },
    number: { type: 'string', pg: { type: 'varchar', length: 32, unique: true } },
    customerId: { type: 'string', pg: { references: { resource: 'customers', onDelete: 'cascade' } } },
    status: { type: 'string', enum: ['draft', 'sent', 'paid'] },     // text + CHECK
    tags: { type: 'array', items: { type: 'string' } },              // text[]
    lines: { type: 'array', items: { type: 'object' } },             // jsonb
    note: { type: 'string', nullable: true },
    createdAt: DateSchema                                            // timestamptz
  },
  required: ['entityId', 'number', 'customerId', 'status'],
  pg: {
    indexes: [{ name: 'idx_invoice_entity_created', columns: ['entityId', 'createdAt'] }]
  }
}
```

| JSON Schema | Postgres |
|---|---|
| `string` | `text` |
| `string` + `format: 'uuid'` | `uuid` |
| `DateSchema` (`{type:'object', format:'date-time'}`) | `timestamptz` |
| `integer` / `number` / `boolean` | `integer` / `double precision` / `boolean` |
| `array` of plain `string`/`integer`/`number`/`boolean` items | native `<scalar>[]`, e.g. `text[]` |
| any other `array`, nested `object` | `jsonb` |
| string `enum` | `text` + `CHECK` |
| `nullable: true` | nullable column |
| in `required[]` | `NOT NULL` |
| `secure: true` | ciphertext column, `lock`/`unlock` aware |
| `id` property | primary key, `gen_random_uuid()::text` default |

AJV in strict mode rejects unknown keywords, so register `pgKeyword` to allow `pg:`:

```ts
import { pgKeyword } from '@owlmeans/postgres-resource'

ajv.addKeyword(pgKeyword)
```

### Migrations

```ts
import { MigrationStage } from '@owlmeans/resource'

resource.migration('0001-rescue-legacy-slug', async tx => {
  await tx.execute(`UPDATE {{}} SET slug = legacy_slug WHERE slug IS NULL`)
}, MigrationStage.Pre)

resource.migration('0002-backfill-status', async tx => {
  await tx.execute(`UPDATE {{}} SET status = $1 WHERE status IS NULL`, ['draft'])
}, MigrationStage.Post)
```

Migrations declared on a table this package just created are **baselined**, not executed. An edited
applied body raises `MigrationConflict`; a failing one raises `MigrationError` and aborts `init()`.

### Custom SQL and transactions

| Placeholder | Resolves to |
|---|---|
| `{{}}` / `{{self}}` | the owning resource's `"schema"."table"` |
| `{{alias}}` | another registered Postgres resource's qualified table |
| `{{alias.property}}` | that resource's qualified column |
| `{{#alias}}` | the bare quoted table name (for `ON CONFLICT ON CONSTRAINT`) |
| `{{$}}` | the owning resource's quoted schema |

```ts
const overdue = await invoices.select(
  `SELECT {{}}.* FROM {{}} JOIN {{customers}} ON {{customers.id}} = {{self.customerId}}
   WHERE {{self.entityId}} = $1 AND {{self.status}} = $2 AND {{customers.active}} = $3`,
  [entityId, 'sent', true]
)

const settled = await invoices.transaction(async tx => {
  const count = await tx.execute(
    `UPDATE {{}} SET status = $1 WHERE {{self.customerId}} = $2 AND {{self.status}} = $3`,
    ['paid', customerId, 'sent']
  )
  await tx.execute(`UPDATE {{payments}} SET settled = true WHERE {{payments.customerId}} = $1`, [customerId])

  return count
})
```

An unknown alias or property raises `PostgresPlaceholderError` at parse time rather than being
substituted blindly.

## API

### `makePostgresResource<R, T>(alias, dbAlias?, serviceAlias?, tableName?): T`

Creates a Postgres resource. `dbAlias` and `serviceAlias` default to `DEFAULT_DB_ALIAS`
(`'postgres'`). `tableName` overrides the physical table name, which otherwise derives from the alias.
`schema`, `index()` and `migration()` land in a module-scope declaration keyed by alias.

### `PostgresResource<T>`

Extends `Resource<T>`, `LockableResource<T>` and `MigratableResource<PostgresTx, PostgresResource<T>>` with:

- `schema?: AnySchema`, the source of truth for the table structure
- `table: TableSpec` / `entity: PgRuntimeTable`, the compiled spec and the runtime Drizzle table (after `init()`)
- `db(): Promise<PostgresDb>` / `client(): Promise<Pool>`
- `index(name, spec: PgIndexSpec)` / `migration(name, apply, stage?)`, chainable declarations
- `query(text, params?)` / `queryOne(text, params?)` / `execute(text, params?)`, which return raw rows or the affected count
- `select(text, params?)` / `selectOne(text, params?)`, which return rows marshalled back into `T`
- `ref(alias?): string`, the fully qualified identifier of this or another resource
- `transaction(fn)`, which runs `fn` with a `PostgresTx` (`client`, `query`/`queryOne`/`execute`, `ref`)
- `insert(record)` (a caller-supplied id), `upsert(record, conflict?)`, `patch(record, opts?)` (merge)
- `lock(record, fields?)` / `unlock(record, fields?)`, which encrypt/decrypt `secure` fields
- `getDefaults(): Partial<T>`

### `Resource<T>` methods (all implemented)

`get`, `load`, `list`, `count`, `create`, `update`, `save`, `delete`, `take`, `purge`

`get` and `load` take either an id or a `Criteria<T>` (with an optional `sort`), so reading one
record by several fields is a single statement. `create` refuses a caller-supplied id (use
`insert`); `update` replaces the whole record (use `patch` to merge); `take` deletes the record it
returns, atomically, and raises when there is nothing to take where `delete` answers `null`; `purge`
refuses an empty criteria rather than emptying the table. `ttl` raises `UnsupportedArgumentError`,
since Postgres has no row expiry.

Criteria follow the shared vocabulary from [`@owlmeans/resource`](../resource). A key naming no
column raises `UnsupportedArgumentError`. A dotted key reaches into a `jsonb` column, a criteria
object against a `jsonb` column becomes containment (`@>`), and `$contains`/`$contained`/`$overlaps`
are `@>`/`<@`/`&&` on array columns.

### Errors

`PostgresError` and its subclasses are `PostgresSyncError`, `PostgresCastRequired`,
`PostgresConstraintError`, `PostgresForeignKeyError`, `PostgresCheckError`, `PostgresDeadlockError`
(`retryable`), `PostgresPlaceholderError`, `PostgresConnectionError` and `PostgresBootstrapError`.
Driver errors are translated by `pgErrorToResourceError`, which unwraps Drizzle's
`DrizzleQueryError` to reach the `pg` error underneath and preserves the raw
`code`/`detail`/`hint`/`severity` in the message. Unique violations surface as `RecordExists` and
not-null violations as `MisshapedRecord`.

### Exports

| Symbol | Kind | Purpose |
|---|---|---|
| `makePostgresResource` | function | The resource factory |
| `PostgresResource<T>` | type | The resource interface described above |
| `PostgresDbService`, `PostgresDb`, `PostgresTx`, `PostgresMeta` | type | Connection service contract (implemented by `@owlmeans/postgres`), db handle, transaction façade, `DbConfig.meta` shape |
| `TableSpec`, `ColumnSpec`, `ColumnJsonType`, `PgRuntimeTable` | type | The compiled table description |
| `PgPropertyOverride`, `PgRootOverride`, `PgIndexSpec`, `PgUniqueSpec`, `PgCheckSpec`, `PgReferenceSpec` | type | The `pg:` vocabulary and `index()` spec |
| `LiveTable`, `LiveColumn`, `LiveIndex`, `LiveConstraint`, `DdlPlan`, `DdlStatement`, `DdlKind` | type | Introspection results and the reconciliation plan |
| `pgKeyword` | const | `{ keyword: 'pg', valid: true }` for AJV strict mode |
| `schemaToTableSpec`, `toFormatType` | function | The schema compiler |
| `criteriaToSql`, `sortToSql` | function | `Criteria<T>` to a WHERE clause and `Sort<T>` to ORDER BY over the same table |
| `refOf`, `resolvePlaceholders`, `resetPlaceholderCache`, `PlaceholderContext` | function / type | `{{alias}}` resolution, identifiers only |
| `pgTableName`, `pgIdentifier`, `assertSqlIdentifier`, `quoteIdent`, `quoteLiteral`, `qualify`, `advisoryKey` | function | Identifier helpers |
| `rowToRecord`, `resultToRecord`, `recordToValues`, `recordToFullValues`, `specToTable` | function | Row and record marshalling, Drizzle table construction |
| `initializeTable`, `applyForeignKeys`, `TableInit` | function / type | The `init()` lifecycle |
| `introspectTable`, `countNonNull`, `planSync`, `planForeignKeys`, `applyPlan`, `ensureSchema`, `acquireLock`, `releaseLock` | function | Reconciliation machinery |
| `makeTx`, `makeMigrationStore` | function | The migration façade and ledger |
| `getDeclaration`, `resetDeclarations`, `PostgresDeclaration` | function / type | Module-scope declarations per alias; `resetDeclarations` is the testing seam |
| `getSchemaSecureFeilds` | function | `secure: true` properties used by `lock`/`unlock` |
| `pgErrorToResourceError`, `describePgError`, `PostgresError` family | function / class | Driver error translation |
| `DEFAULT_DB_ALIAS`, `DEFAULT_PAGE_SIZE`, `DEF_MIGRATIONS_TABLE` | const | `'postgres'`, `100`, `'_owlmeans_migrations'` |
| `PG_KEYWORD`, `PG_MAX_IDENTIFIER`, `ID_FIELD`, `DEF_SQL_TYPE`, `DEF_JSON_TYPE`, `DEF_ID_DEFAULT`, `STRING_RETURNING_TYPES` | const | Compiler constants |
| `PgAutoSync`, `PgIndexMethod`, `PgReferentialAction`, `PgErrorCode`, `PgTypeOid` | enum | Reconciliation policy, index methods, FK actions, driver codes, type OIDs |

## Common pitfalls

- **A second owner of the DDL.** Drizzle table definitions, `drizzle-kit` or hand-written
  `CREATE TABLE` compete with reconciliation, which drops what the other owner added.
- **`Full` sync on an adopted table drops undeclared columns.** Boot once with `Additive`, confirm
  the plan comes out empty, then switch to `Full`. Or list the columns in `pg.unmanaged`.
- **`autoSync: 'off'` never creates the table.** The first query then dies with `42P01`.
- **Listing `id` in `required`**, or generating ids in application code. The database assigns them,
  and `create` refuses a supplied id; use `insert` when you really have one.
- **Interpolating values into SQL.** Placeholders are for identifiers. Values go in `params`.
- **Aliasing a table that a placeholder still names.** `{{self.x}}` expands to the qualified
  `"schema"."table"."x"`, which Postgres rejects next to `FROM {{}} p`.
- **Relying on registration order for `{{alias}}`.** It reads the other resource's *initialized*
  table spec. Foreign keys to a later resource are deferred by the `appendPostgres` middleware, so
  do not reorder registrations.
- **The same index declared twice under different names** (schema root, property override and
  `index()`). Duplicates are collapsed only by name.
- **Expecting `update` to merge.** Use `patch`.
- **Reading "everything" with `list(where)`.** It stops at 100. Use `{ size: 0 }`, or page with a
  unique tiebreak.
- **A migration body closed over a loop variable.** Its checksum fingerprints the wrapper and drifts.

## Related packages

- [`@owlmeans/postgres`](../postgres): the connection service required by this package
- [`@owlmeans/resource`](../resource): `Resource<T>`, `ResourceRecord`, criteria, migrations, error family
- [`@owlmeans/mongo-resource`](../mongo-resource): the MongoDB counterpart
- [`@owlmeans/redis-resource`](../redis-resource): caches, locks and expiring records beside the table
- [`@owlmeans/queue`](../queue): long imports and batch writes that should not run inside a request

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.30
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
