# @owlmeans/mongo-resource

MongoDB-backed `Resource<T>` implementation — the primary database resource for OwlMeans server apps.

## Overview

- `makeMongoResource<R, T>(alias, dbAlias?, serviceAlias?, maker?, collectionName?)` — factory for MongoDB resources
- `MongoResource<T>` — extends `Resource<T>` with MongoDB collection, indexing, field encryption, code migrations and ObjectId references
- Supports CRUD, list/pagination, AJV schema validation ($jsonSchema collection validators), and field-level locking (encryption)
- Declared references convert between the string ids records carry and the `ObjectId`s the collection stores — the same way `_id` already does
- Code migrations run automatically at resource initialization, tracked in a per-database `_owlmeans_migrations` ledger
- Used for all persistent data models in server applications

## Installation

```bash
bun add @owlmeans/mongo-resource
```

## Usage

Define a resource:

```typescript
import { makeMongoResource } from '@owlmeans/mongo-resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { ResourceMaker } from '@owlmeans/resource'

export interface ProjectResource extends MongoResource<ProjectRecord> {}

export const makeProjectResource: ResourceMaker<ProjectRecord, ProjectResource> = (dbAlias, serviceAlias) => {
  const resource = makeMongoResource<ProjectRecord>(
    RES_PROJECT, dbAlias, serviceAlias, makeProjectResource
  )
  resource.schema = ProjectSchema
  resource.index('entity', { entityId: 1 })
  resource.index('alias', { alias: 1 })
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

## API

### `makeMongoResource<R, T>(alias, dbAlias?, serviceAlias?, maker?, collectionName?): T`

Creates a MongoDB resource. `dbAlias` defaults to `DEFAULT_DB_ALIAS` (`'mongo'`).
`collectionName` overrides the physical collection name (otherwise `resourcePrefix + alias`).
Pass the maker itself as the 4th argument so `schema`/`index()` survive context switches;
`migration()`/`reference()` survive regardless (module-scope declarations keyed by alias).

### `MongoResource<T>`

Extends `Resource<T>` (and the shared `MigratableResource<MongoTx>` capability) with:
- `collection: Collection` — MongoDB collection
- `db(): Promise<Db>` / `client(): Promise<MongoClient>`
- `index(name, spec, options?): this` — define a collection index
- `reference(field, targetAlias?): this` / `references()` — declare that a field stores another record's id (see below)
- `migration(name, apply, stage?): this` / `migrations()` — register a code migration (see below)
- `lock(record, fields?)` / `unlock(record, fields?)` — encrypt/decrypt secure fields
- `getDefaults(): Partial<T>` — default values derived from schema

### ObjectId references

`reference(field, targetAlias?)` declares that a record field references another record's id.
The resource then treats the field exactly like `_id`:

- Records and criteria carry **strings**; the collection stores **`ObjectId`s**. Conversion is
  automatic on every read, write and lookup — including `$in`-style operator objects,
  `$and`/`$or`/`$nor` branches and arrays of ids. `id` criteria are mapped onto `_id`.
- Writes are strict (a non-24-hex value throws `MisshapedRecord`); reads and criteria are
  tolerant (a non-id value simply matches nothing).
- The field gets a mongo-level index (`ref_<field>`) automatically, unless an index with the
  identical key pattern is already declared, and the collection validator declares it
  `objectId`.
- Declaring a reference registers the system migration `$ref:<field>@1` (pre stage) that
  converts pre-existing string ids in place — idempotent and interrupt-safe. On every boot
  the collection is additionally probed for convertible strings and repaired if the ledger
  and the data disagree (the double check). Conversion bypasses document validation, which
  requires the `bypassDocumentValidation` privilege (`dbOwner`/`root` hold it).
- Only declare fields whose values really are another record's `id`. Business keys, composite
  keys, external provider ids and slugs must stay strings — converting them corrupts data.
- Raw `resource.collection.*` access bypasses the conversion: marshal filter values with
  `marshalReference(field, value)` and convert read-back ids to strings yourself.

### Migrations

`migration(name, apply, stage?)` registers a code migration, applied once per database in
declaration order and recorded in the `_owlmeans_migrations` collection (one ledger per
database — an Entity-layer database tracks its own).

- `MigrationStage.Pre` runs before the validator/index update, `Post` after. On a collection
  created by this very boot, registered migrations are **baselined** (recorded, not run).
- Bodies receive a `MongoTx` (`db`, `collection`, `use(alias)`, `ref(alias)`) and must be
  **idempotent** — multi-document transactions are unavailable on a standalone `mongod`, so
  the ledger claims-then-completes and an interrupted body may re-run.
- The checksum fingerprints the body's source text: keep bodies at module scope; an edited
  applied body raises `MigrationConflict` at boot.

### `Resource<T>` methods (all implemented)

`get`, `load`, `create`, `update`, `save`, `delete`, `pick`, `list`

### Constants

- `DEFAULT_DB_ALIAS` — `'mongo'`
- `DEFAULT_PAGE_SIZE` — `10`
- `DEF_MIGRATIONS_COLLECTION` — `'_owlmeans_migrations'`

## Related Packages

- [`@owlmeans/resource`](../resource) — `Resource<T>`, `ResourceRecord`, `ResourceMaker` base
- [`@owlmeans/mongo`](../mongo) — MongoDB connection service required by this package

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
