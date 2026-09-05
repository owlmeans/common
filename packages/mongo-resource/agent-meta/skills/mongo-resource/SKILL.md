---
name: mongo-resource
description: How to use @owlmeans/mongo-resource — MongoDB-backed Resource implementation with AJV-schema validators, code migrations and ObjectId reference conversion. Auto-invoked when defining a resource backed by MongoDB, declaring record references, or writing mongo migrations.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/mongo-resource

**Layer:** Infra
**Install:** `"@owlmeans/mongo-resource": "^0.1.18-rc.12"` in `dependencies` (peers `mongodb`, `ajv`)

The Mongo counterpart of [[postgres-resource]]. A collection has no structure of its own, so
here the resource layer owns the *validator* (`$jsonSchema` from the AJV schema), the indexes,
the code migrations, and the string↔`ObjectId` conversion for `_id` **and every declared
reference**.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeMongoResource<R, T>(alias, dbAlias?, serviceAlias?, collectionName?)` | The resource factory. Aliases default to `DEFAULT_DB_ALIAS` (`'mongo'`). `collectionName` overrides the collection (else `resourcePrefix + alias`). |
| `MongoResource<T>` | `Resource<T>` + `collection`, `db()`/`client()`, `index`/`indexes`, `reference`/`references`, `migration`/`migrations` (the shared `MigratableResource` capability), `lock`/`unlock`, `getDefaults`, and the `dbAlias`/`serviceAlias` it was registered against. Anything naming a collection on another resource's behalf reads *that* resource's `dbAlias`, since two resources in one database can carry different `resourcePrefix`es. |
| `MongoDbService`, `MongoTx` | Service contract implemented by `@owlmeans/mongo`; the façade handed to migrations (`db`, `collection`, `use(alias)`, `ref(alias)`). |
| `MongoReference`, `MongoRefOptions` | A declared ObjectId reference and the `reference()` options (`resource`, `noIndex`). |
| `marshalReference`, `demarshalReference`, `demarshalRefs`, `marshalCriteria`, `identityCriteria`, `isObjectIdHex` | The conversion layer — reuse these wherever raw driver access bypasses the resource. |
| `criteriaToFilter`, `sortToMongo` | `Criteria<T>` → a mongo filter (references converted, every shared operator rewritten into a mongo expression) and `Sort<T>` → a mongo sort spec. |
| `convertReferenceField`, `makeRefMigration`, `reconcileReferences`, `refMigrationName` | The system reference migration's machinery. |
| `makeMongoTx`, `makeMongoMigrationStore` | The migration store (ledger) implementation. |
| `getDeclaration`, `resetDeclarations`, `MongoDeclaration` | Module-scope migration/reference declarations, keyed by alias; `resetDeclarations(alias?)` is the testing seam. |
| `getSchemaSecureFeilds` | The `secure: true` schema properties `lock`/`unlock` operate on when the caller names no fields. |
| `DEFAULT_DB_ALIAS`, `DEFAULT_PAGE_SIZE`, `DEF_MIGRATIONS_COLLECTION`, `DEF_MIGRATION_WAIT`, `DEF_MIGRATION_POLL`, `MONGO_DUPLICATE_KEY` | Constants. |

Validator compilation and collection naming stay inside the package — the entry point exports
nothing to reach them with, so a consumer shapes a collection by assigning `resource.schema` and
declaring indexes, never by calling the compiler.

## Usage — the maker pattern

```typescript
export const makeProjectStoryResource: ResourceMaker<ProjectStoryRecord, ProjectStoryResource> =
  (dbAlias, serviceAlias) => {
    const resource = makeMongoResource<ProjectStoryRecord, ProjectStoryResource>(
      RES_PROJECT_STORY, dbAlias, serviceAlias
    )
    resource.schema = ProjectStorySchema
    resource.reference('projectId', RES_PROJECT)
    resource.index('code', { projectId: 1, code: 1 }, { sparse: true })
    resource.migration('0001-backfill-code', async tx => { /* ... */ })

    return resource
  }
context.registerResource(makeProjectStoryResource())
```

`migration()` and `reference()` live in module-scope declarations keyed by alias, so a maker
that runs more than once for the same alias (a custom maker, a test) re-declares the same
entries and loses nothing — losing one would silently lose a data transformation.

## ObjectId references

A field that stores **another record's id** is declared with `reference(field, targetAlias?)`.
The resource then behaves for that field exactly as it does for `_id`:

- **Records and criteria carry strings; the collection stores `ObjectId`s.** Conversion is
  automatic in `create`/`update`/`save` (write), `get`/`load`/`list`/`count`/`delete`/`take`/
  `purge` (read and lookup), and in every criteria object — including operator objects,
  `$and`/`$or`/`$not` branches, and arrays of ids (elementwise). `$regex`-style operands are
  left alone.
- **Writes are strict**: storing a non-24-hex value in a declared reference throws
  `MisshapedRecord('ref:<field>')` — a silent string would reintroduce the mixed-type state.
  Reads and criteria are tolerant: an unconverted legacy string comes back as-is; a non-id
  criteria value simply matches nothing (the auth `userId ?? profileId` fallback relies on
  this).
- **`id` criteria address `_id`.** Documents never store an `id` field, so `list({ id })` and
  `load(id)` map onto `_id` with conversion; a criteria key naming a declared reference converts
  the same way.
- **The field is indexed** automatically (`ref_<field>`), unless `noIndex: true` or the
  resource already declares an index with the identical key pattern (mongo forbids two
  indexes over the same keys; a declared unique index wins).
- **The validator declares the field `objectId`** (nullable/array shapes carry over from the
  AJV property) — after the switch a raw string write is rejected at the collection level.

### The system migration and its double check

Declaring a reference registers `$ref:<field>@1` at `Pre` stage: an idempotent, interrupt-safe
`updateMany` that converts stored 24-hex strings (scalar or array elements) to `ObjectId`s and
leaves everything else untouched. On restart the ledger says whether it ran; **independently**,
after structure update the boot probes the collection for convertible strings and repairs any
drift (restored backup, legacy writer), logging a warning. Both paths run with
`bypassDocumentValidation` — the connection's user must hold that privilege (`dbOwner`/`root`
do).

The `@1` in the name is the body's version. The body is shared by every field, so its checksum
never distinguishes them — **any semantic edit to `convertReferenceField` must bump the
version suffix** in `refMigrationName`, or every already-applied ledger raises
`MigrationConflict` at boot.

### What is NOT a reference — do not declare these

Only fields assigned from another record's `.id` qualify. Known traps from the live codebase:

- `entityId` / `entitySlug` — the **organization entity**, never a document in this database.
  `entitySlug` is the renameable name that travels on tokens and URLs; `entityId` is the stable id
  the organization registry minted for it, and a deployment with no resolver stores the slug in the
  same field. Neither is an `ObjectId`, and the field carries both shapes across deployments
- `profileId` — composite key `"{type}:{accountId}"`; `credentials.userId` — external
  provider key `"{type}:{service}:{sub}"` (while `profile.userId` **is** a reference)
- Stripe ids (`externalId`, `productId`, `taxId`), Cloudflare `providerId`, GitHub numeric ids
- locally minted slugs/tokens (`linkId`, `alias`, `slug`, `code`, `credential`)

Converting one of these corrupts the collection and breaks unique indexes. When in doubt,
trace what the writer actually assigns.

### Raw driver access bypasses all of this

`resource.collection.find/aggregate/findOneAndUpdate` see `ObjectId`s. Marshal filter values
with `marshalReference(field, value)` and convert read-back documents' reference fields (and
`_id`) to strings by hand — or better, stay on the resource API.

## Migrations

`resource.migration(name, apply, stage?)` — the shared `MigratableResource` capability from
[[resource]]. Applied once per database, in declaration order, ledgered in
`_owlmeans_migrations` (one ledger per database, so each database tracks its own).

- `Pre` runs **before** the validator is updated and indexes reconcile; `Post` after. A `Pre`
  body writes shapes the *old* validator allows; a `Post` body the *new* one.
- **A `Pre` body that removes an indexed field must drop that index itself.** Indexes reconcile
  *after* `Pre`, so the old index is still live and still enforcing while the body writes, whatever
  the declaration now says. `$unset`ing an indexed field collapses every document onto
  `{ <field>: null, … }`, and on a `unique` index the second one dies with E11000 — mid-migration,
  after earlier collections were already rewritten, leaving the database half-migrated and the boot
  aborting on every restart. Drop the stale index by name in the body first (guard on the key spec
  so the drop is idempotent) and let reconciliation recreate it from the declaration.
- **Index reconciliation matches by name and recreates on any difference.** A live index whose key
  pattern or options differ from the declaration is dropped and created again, so a renamed field
  does converge — after `Pre`, which is why the bullet above exists. Text indexes are the one
  exception: a live index carrying `weights` is left as it is, and changing one means dropping it
  yourself.
- On a collection this boot just created, every registered migration is **baselined**
  (recorded, not run) — a fresh collection is born at head.
- **No transactions**: a standalone `mongod` (the dev/CI target) rejects multi-document
  transactions, so the ledger claims-then-completes — the unique `(alias, name)` index is the
  mutual exclusion; a replica losing the race waits for the winner; a failed body withdraws
  the claim so the next boot retries. Consequence: **write migration bodies idempotent** —
  they may be interrupted and re-run.
- The checksum fingerprints the body's **source text**. Keep bodies at module scope; an edited
  applied body raises `MigrationConflict`, a throwing one `MigrationError` and the boot
  aborts. A body that closes over a loop variable fingerprints the wrapper — the trap
  `createMigrationRegistry` documents.
- Inside a body, `tx.use(alias)` / `tx.ref(alias)` address other registered resources'
  collections by alias — resolved from config, so registration order does not matter (unlike
  Postgres `{{alias}}`).

## Lifecycle order at `init()`

1. probe for the collection
2. absent → baseline all migrations; present → run `Pre` (system `$ref:` first if declared before app migrations)
3. create collection (validator + indexes) or update validator + reconcile indexes
4. present → run `Post`
5. present → reconcile declared references (probe + repair — the double check)

Steps 4 and 5 belong to the existing-collection path alone: a collection this boot created is
already at head and carries no legacy strings to repair.

## Method semantics worth remembering

| Method | Semantics |
|---|---|
| `create` | refuses a caller-supplied id (`RecordExists`); rejects `opts.ttl` (`UnsupportedArgumentError`) |
| `update` | **replaces** the whole record (no merge), keeping the document's `_id` |
| `load(id)` / `get(id)` | a string that is not a 24-hex id matches nothing — `load` answers `null` and `get` throws, where handing it to `ObjectId` would raise a driver error at a call site that only asked whether the record exists |
| `load(where, { sort })` / `get(where, { sort })` | `findOne` with the sort applied, so "the newest matching record" is one round trip |
| `list` | criteria go through reference conversion; documents never store `id` — use `id` criteria freely, they map to `_id` |
| `delete` / `take` | one `findOneAndDelete`: the record is handed back by the very operation that removed it, so two callers can never be given the same record. `take` **deletes** and throws `UnknownRecordError` on a miss |
| `purge` | `deleteMany`; refuses an empty criteria object (`UnsupportedArgumentError('purge:no-criteria')`) rather than emptying the collection |
| `lock`/`unlock` | encrypt/decrypt `secure: true` schema fields via the db service |

## Paging

Mongo is **PAGED**: `DEFAULT_PAGE_SIZE` is `100`, so `list(where)` with no `size` returns the first
100 matches — a collection is unbounded and an unpaged read is an incident waiting for the document
count to grow. `ListResult.total` counts every match regardless of the window, and
`list(where, { size: 0 })` is the explicit, greppable ask for the whole result set. Asking for a
page while lifting the limit contradicts itself and raises
`UnsupportedArgumentError('page-without-size')` rather than quietly answering page 0.

## Criteria against a collection

`criteriaToFilter` rewrites the shared vocabulary ([[resource]]) into mongo expressions so one
criteria object selects the same records here as it does in SQL and in memory. Two rewrites are
worth knowing:

- **`$exists` and `$null` compare against `null`**, not mongo's own `$exists`. The shared question
  is whether a field *has a value*, which the other stores answer as `IS NULL` / `value == null`;
  mongo's `$exists` answers whether the key is present, and a key present but null would part the
  three stores over one object.
- **`$like`/`$ilike` become anchored regular expressions** with `%` as any run and `_` as one
  character; `$between` becomes `$gte`/`$lte`; and `$contains`/`$contained`/`$overlaps` mean over
  an array field exactly what the postgres operators `@>`, `<@` and `&&` mean. An operator mongo
  cannot answer raises `UnsupportedArgumentError` rather than being dropped.

## Tests

`bun test ./tests` in this package runs the conversion-layer unit specs (`criteria.spec.ts`,
`refs.spec.ts`) ungated, plus `crud.spec.ts`, which needs a real collection and self-skips behind
the same `MONGO_URL` gate as the integration suites. Specs that build a real `ServerContext` live in
`@owlmeans/mongo` (`crud.spec.ts`, `migration.spec.ts`, `references.spec.ts`), also gated on
`MONGO_URL` — see [[testing-integration]]; a dev port-forward to the cluster mongo fills the
`MONGO_URL` the repo's `.env.example` describes.

## Depends On

- `@owlmeans/resource` · `@owlmeans/context` · `@owlmeans/server-context`
- peer `mongodb`, `ajv`

## Related

- [[mongo]] — the connection service this resolves through
- [[resource]] — `Resource<T>`, `MigratableResource`, the migration framework, errors
- [[postgres-resource]] — the Postgres counterpart (structure reconciliation instead of validators)
