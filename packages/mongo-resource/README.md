# @owlmeans/mongo-resource

MongoDB-backed `Resource<T>` for server apps. The AJV schema becomes the collection validator, and
the package also handles indexes, code migrations and the conversion between string ids and
`ObjectId`. Use it for documents whose shape varies per record or per tenant and that are read
whole by id: per-tenant form submissions, generated content documents, compacted agent
conversations. Postgres, not Mongo, is the default for records you filter, join, sum or report
across (see [`@owlmeans/postgres-resource`](../postgres-resource)). Expiring or coordinating data
(sessions, locks, counters, pub/sub) goes in [`@owlmeans/redis-resource`](../redis-resource).
Client-side records go in [`@owlmeans/state`](../state).

## Installation

```bash
bun add @owlmeans/mongo-resource@^0.1.18-rc.33
```

`mongodb` and `ajv` are peer dependencies. The connection service comes from
[`@owlmeans/mongo`](../mongo) (`appendMongo`).

## Concepts

- **Resource maker**: a `ResourceMaker<R, T>` function that calls `makeMongoResource`, assigns
  `schema` and declares indexes, references and migrations. The server context factory registers
  its result once with `context.registerResource(makeXResource())`.
- **Validator**: the resource's AJV schema compiled into a `$jsonSchema` collection validator. It
  is reapplied, and indexes are reconciled, on every boot.
- **Reference**: a field declared with `reference(field, targetAlias?)` that stores another
  record's id. Records and criteria carry strings, the collection stores `ObjectId`s, and the
  resource converts between them the same way it does for `_id`.
- **Migration**: a code body registered with `migration(name, apply, stage?)`. It runs once per
  database at `Pre` or `Post` stage around structure reconciliation, and is recorded in the
  `_owlmeans_migrations` ledger.
- **Declaration**: the module-scope, per-alias store that holds references and migrations. A maker
  called twice for the same alias extends it; the second call does not replace it.
- **Paged by default**: `list(where)` returns at most `DEFAULT_PAGE_SIZE` (100) documents.
  `{ size: 0 }` explicitly asks for all of them.

## Usage

### Define and register a resource

```ts
import { makeMongoResource } from '@owlmeans/mongo-resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { ResourceMaker } from '@owlmeans/resource'

export interface ProjectResource extends MongoResource<ProjectRecord> {}

export const makeProjectResource: ResourceMaker<ProjectRecord, ProjectResource> = (dbAlias, serviceAlias) => {
  const resource = makeMongoResource<ProjectRecord, ProjectResource>(RES_PROJECT, dbAlias, serviceAlias)
  resource.schema = ProjectSchema
  resource.index('entity', { entityId: 1 })
  resource.index('alias', { entityId: 1, alias: 1 }, { unique: true })

  return resource
}

// in the server context factory, next to appendMongo(context)
context.registerResource(makeProjectResource())
```

### Read and write from a handler

```ts
const projects = context.resource<ProjectResource>(RES_PROJECT)

const created = await projects.create({ entityId, alias, title, status: 'draft' })
const one = await projects.load({ entityId, alias })                      // null when absent
const newest = await projects.get({ entityId }, { sort: [{ field: 'createdAt', order: 'desc' }] })
const page = await projects.list(
  { entityId, status: ['draft', 'active'] },                              // an array means "any of these"
  { page: 0, size: 20, sort: [{ field: 'createdAt', order: 'desc' }] }
)
const open = await projects.count({ entityId, status: { $ne: 'archived' } })

await projects.update({ ...created, title: 'Renamed' })                   // replaces the whole record
await projects.purge({ entityId, status: 'archived' })                    // refuses empty criteria
```

`entityId` here is the organization's stable record id, taken from `requireEntityKey(req)` in the
handler, never from the token. Only `entitySlug` travels on the wire.

### References, compound indexes and a domain method

A revisioned design document per story, modelled on a real application resource. `current` is a
domain method the app adds to its own resource interface:

```ts
export interface DesignResource extends MongoResource<DesignRecord> {
  current: (projectId: string, code: string) => Promise<DesignRecord | null>
}

export const makeDesignResource: ResourceMaker<DesignRecord, DesignResource> = (dbAlias, serviceAlias) => {
  const resource = makeMongoResource<DesignRecord, DesignResource>(RES_DESIGN, dbAlias, serviceAlias)

  resource.current = async (projectId, code) => {
    const { items } = await resource.list(
      { projectId, code }, { size: 1, sort: [{ field: 'revision', order: 'desc' }] }
    )

    return items[0] ?? null
  }

  resource.schema = DesignSchema
  resource.reference('projectId', RES_PROJECT)          // stored as ObjectId, indexed ref_projectId
  resource.reference('storyId', RES_STORY)
  resource.index('current', { projectId: 1, code: 1, revision: -1 })
  resource.index('story', { storyId: 1, revision: -1 }, { sparse: true })

  return resource
}
```

`code` is a business key and stays a plain string. Only fields assigned from another record's
`.id` are references.

### A migration

```ts
import { MigrationStage } from '@owlmeans/resource'
import type { MongoTx } from '@owlmeans/mongo-resource'

// Module scope, so the checksum fingerprints this body and nothing else.
const backfillStatus = async (tx: MongoTx) => {
  await tx.collection.updateMany({ status: { $exists: false } }, { $set: { status: 'draft' } })
}

resource.migration('0001-backfill-status', backfillStatus, MigrationStage.Post)
```

The body receives a `MongoTx` (`db`, `collection`, `use(alias)`, `ref(alias)`) and must be
idempotent: without transactions an interrupted body can run again.

### Raw driver access with converted references

```ts
import { marshalReference } from '@owlmeans/mongo-resource'

await projects.collection.updateOne(
  { _id: marshalReference('id', projectId) as never, jobSequence },
  { $inc: { jobSequence: 1 }, $set: { updatedAt: new Date() } }
)
```

`resource.collection.*` bypasses the conversion layer. Marshal ids yourself, or stay on the
resource API.

## API

### `makeMongoResource<R, T>(alias, dbAlias?, serviceAlias?, collectionName?): T`

Creates a MongoDB resource. `dbAlias` and `serviceAlias` default to `DEFAULT_DB_ALIAS` (`'mongo'`).
`collectionName` overrides the physical collection name (otherwise `resourcePrefix + alias`, limited
to `[a-zA-Z0-9_-]`). `migration()` and `reference()` are kept in module-scope declarations keyed by
alias, so a maker that runs more than once for the same alias re-declares the same entries and
loses nothing.

### `MongoResource<T>`

Extends `Resource<T>` with the shared `MigratableResource<MongoTx, MongoResource<T>>` and
`LockableResource<T>` capabilities, plus:
- `collection: Collection`, the MongoDB collection
- `db(): Promise<Db>` / `client(): Promise<MongoClient>`
- `index(name, spec, options?): this`, which defines a collection index
- `reference(field, targetAlias?): this` / `references()`, which declare that a field stores another record's id (see below)
- `migration(name, apply, stage?)` / `migrations()`, which register a code migration (see below)
- `lock(record, fields?)` / `unlock(record, fields?)`, which encrypt/decrypt `secure: true` schema fields
- `getDefaults(): Partial<T>`, the default values derived from the schema
- `dbAlias` / `serviceAlias`, the aliases the resource was registered against

### Criteria, sorting and paging

`Criteria<T>` is the portable query shape from [`@owlmeans/resource`](../resource): a bare value
is equality, a bare array is "any of these", `null` asks for the absence of a value and
`undefined` is skipped so an untouched filter never empties a list. Every operator in the shared
vocabulary is translated into the Mongo expression that answers the same question, so one criteria
object means the same thing here as it does against Postgres or an in-memory store. The vocabulary
is `$eq $ne $gt $gte $lt $lte $in $nin $exists $null $like $ilike $regex $startsWith $endsWith
$between $contains $contained $overlaps`, plus `$and`/`$or`/`$not`. `$exists` and `$null` both ask
whether the field *has a value*, not whether the key is present. An operator outside the
vocabulary raises `UnsupportedArgumentError`.

Paging is per call: `list(where, { page, size, sort })`. Mongo pages by default and returns
`DEFAULT_PAGE_SIZE` records when no `size` is given, because a caller should not get an unbounded
read of a collection by omission. `list(where, { size: 0 })` asks for the whole result set
explicitly, and a `page` without a `size` raises `UnsupportedArgumentError('page-without-size')`.
`ListResult.total` is always filled; `page` and `size` come back only when a limit was applied.
`sort` takes field names (ascending) or `{ field, order: 'desc' }`, and `id` addresses `_id`.

### ObjectId references

`reference(field, targetAlias?)` declares that a record field references another record's id.
The resource then treats the field exactly like `_id`:

- Records and criteria carry **strings**; the collection stores **`ObjectId`s**. Conversion is
  automatic on every read, write and lookup, including `$in`-style operator objects,
  `$and`/`$or`/`$nor` branches and arrays of ids. `id` criteria are mapped onto `_id`.
- Writes are strict: a non-24-hex value throws `MisshapedRecord`. Reads and criteria are tolerant:
  a non-id value simply matches nothing.
- The field gets a Mongo-level index (`ref_<field>`) automatically, unless an index with the
  identical key pattern is already declared, and the collection validator declares it
  `objectId`.
- Declaring a reference registers the system migration `$ref:<field>@1` (pre stage), which
  converts pre-existing string ids in place and is idempotent and interrupt-safe. On every boot
  the collection is also probed for convertible strings and repaired if the ledger and the data
  disagree (the double check). Conversion bypasses document validation, which requires the
  `bypassDocumentValidation` privilege (`dbOwner`/`root` hold it).

### Migrations

`migration(name, apply, stage?)` registers a code migration. It is applied once per database, in
declaration order, and recorded in the `_owlmeans_migrations` collection. The ledger is per
database, so each database tracks its own.

- `MigrationStage.Pre` runs before the validator/index update, `Post` after. On a collection
  created by this very boot, registered migrations are **baselined** (recorded, not run).
- A replica that loses the race to claim a migration waits for the winner (up to
  `DEF_MIGRATION_WAIT`), and a failed body withdraws its claim so the next boot retries.

### `Resource<T>` methods (all implemented)

`get`, `load`, `list`, `count`, `create`, `update`, `save`, `delete`, `take`, `purge`

- `get`/`load` take either an id or a `Criteria<T>` with an optional `{ sort }`; `get` throws
  `UnknownRecordError` where `load` answers `null`. An id that is not a Mongo id finds nothing
  rather than raising a driver error.
- `create` refuses a caller-supplied id (`RecordExists`). `update` replaces the whole record
  addressed by its `id`; `save` creates when the record carries no id and replaces otherwise.
- `delete(id)` and `take(id)` remove atomically through `findOneAndDelete` and hand the record
  back. `take` throws `UnknownRecordError` on absence where `delete` answers `null`.
- `purge(where)` is the bulk delete; it refuses an empty criteria object rather than emptying
  the collection.
- `ttl` is refused with `UnsupportedArgumentError`, because a collection has no per-record expiry.

### Exports

| Symbol | Kind | Purpose |
|---|---|---|
| `makeMongoResource` | function | The resource factory |
| `MongoResource<T>` | type | The resource interface described above |
| `MongoDbService` | type | Connection service contract implemented by `@owlmeans/mongo` |
| `MongoTx` | type | Façade handed to migration bodies: `db`, `collection`, `use(alias)`, `ref(alias)` |
| `MongoReference`, `MongoRefOptions` | type | A declared reference and the `reference()` options (`resource`, `noIndex`) |
| `criteriaToFilter(criteria, refs)` | function | `Criteria<T>` to a Mongo filter, with references converted |
| `sortToMongo(sort)` | function | `Sort<T>[]` to a Mongo sort document (`id` becomes `_id`) |
| `marshalReference(field, value)` | function | String id(s) to `ObjectId` for a write; throws `MisshapedRecord` on non-ids |
| `demarshalReference(value)`, `demarshalRefs(record, refs)` | function | `ObjectId` back to strings for one value or a whole document |
| `marshalCriteria(filter, refs)`, `identityCriteria(field, id, refs)` | function | Convert a Mongo filter's id-addressed values; build a single-record lookup |
| `isObjectIdHex(value)` | function | Strict 24-hex test used by the conversion layer |
| `convertReferenceField`, `makeRefMigration`, `reconcileReferences`, `refMigrationName` | function | The system reference migration and its boot-time probe |
| `makeMongoTx`, `makeMongoMigrationStore` | function | The migration façade and the ledger implementation |
| `getDeclaration(alias)`, `resetDeclarations(alias?)`, `MongoDeclaration` | function / type | Module-scope per-alias declarations; `resetDeclarations` is the testing seam |
| `getSchemaSecureFeilds(schema)` | function | The `secure: true` properties `lock`/`unlock` use when no fields are named |
| `DEFAULT_DB_ALIAS` | const | `'mongo'` |
| `DEFAULT_PAGE_SIZE` | const | `100` |
| `DEF_MIGRATIONS_COLLECTION` | const | `'_owlmeans_migrations'` |
| `DEF_MIGRATION_WAIT`, `DEF_MIGRATION_POLL` | const | How long (60 000 ms) and how often (250 ms) a replica waits for another's migration |
| `MONGO_DUPLICATE_KEY` | const | `11000`, the driver's duplicate-key code |

## Common pitfalls

- **Declaring a non-id field as a reference.** `entityId`/`entitySlug` (the organization entity),
  composite keys such as `profileId`, provider ids (Stripe, GitHub), slugs, aliases and codes must
  stay strings. Converting them corrupts the collection and breaks unique indexes.
- **Two indexes over the same keys.** Mongo refuses them. Declare the index yourself under the key
  pattern a reference would use and the automatic `ref_<field>` index is skipped.
- **Non-idempotent migration bodies.** There are no multi-document transactions on a standalone
  `mongod`, so an interrupted body re-runs.
- **Editing an applied migration**, or defining its body inside a loop or closure. The checksum
  fingerprints source text, so the boot fails with `MigrationConflict`.
- **A `Pre` body that `$unset`s a field under a unique index.** Indexes reconcile *after* `Pre`, so
  the old index is still enforcing and the second document fails with E11000. Drop the stale index
  in the body first.
- **Expecting `update` to merge.** It replaces the whole document. Pass every field that must survive.
- **Reading "everything" with `list(where)`.** It stops at 100. Ask with `{ size: 0 }`, or page.
- **Raw `resource.collection` calls with string ids.** They match nothing against `ObjectId`
  fields. Use `marshalReference`.
- **Passing `{ ttl }`.** It is refused. Expiring records belong in Redis.

## Related packages

- [`@owlmeans/mongo`](../mongo): the MongoDB connection service this package resolves through
- [`@owlmeans/resource`](../resource): `Resource<T>`, criteria, `ResourceMaker`, the migration framework, errors
- [`@owlmeans/postgres-resource`](../postgres-resource): the relational counterpart and the default choice
- [`@owlmeans/redis-resource`](../redis-resource): expiring, cached and pub/sub data
- [`@owlmeans/server-context`](../server-context): the server context resources register on

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.34
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
