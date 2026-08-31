---
name: mongo-resource
description: How to use @owlmeans/mongo-resource — MongoDB-backed Resource implementation with AJV-schema validators, code migrations and ObjectId reference conversion. Auto-invoked when defining a resource backed by MongoDB, declaring record references, or writing mongo migrations.
user-invocable: false
---

# @owlmeans/mongo-resource

**Layer:** Infra
**Install:** `"@owlmeans/mongo-resource": "^0.1.18-rc.7"` in `dependencies` (peers `mongodb`, `ajv`)

The Mongo counterpart of [[postgres-resource]]. A collection has no structure of its own, so
here the resource layer owns the *validator* (`$jsonSchema` from the AJV schema), the indexes,
the code migrations, and the string↔`ObjectId` conversion for `_id` **and every declared
reference**.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeMongoResource<R, T>(alias, dbAlias?, serviceAlias?, maker?, collectionName?)` | The resource factory. Aliases default to `DEFAULT_DB_ALIAS` (`'mongo'`). `collectionName` overrides the collection (else `resourcePrefix + alias`). |
| `MongoResource<T>` | `Resource<T>` + `collection`, `index`, `reference`/`references`, `migration`/`migrations` (the shared `MigratableResource` capability), `lock`/`unlock`, `getDefaults`. |
| `MongoDbService`, `MongoTx` | Service contract implemented by `@owlmeans/mongo`; the façade handed to migrations (`db`, `collection`, `use(alias)`, `ref(alias)`). |
| `MongoReference`, `MongoRefOptions` | A declared ObjectId reference and the `reference()` options (`resource`, `noIndex`). |
| `marshalReference`, `demarshalReference`, `marshalCriteria`, `identityCriteria`, `isObjectIdHex` | The conversion layer — reuse these wherever raw driver access bypasses the resource. |
| `convertReferenceField`, `reconcileReferences`, `refMigrationName` | The system reference migration's machinery. |
| `makeMongoTx`, `makeMongoMigrationStore` | The migration store (ledger) implementation. |
| `getDeclaration`, `resetDeclarations` | Module-scope migration/reference declarations, keyed by alias. |
| `schemaToMongoSchema`, `applyReferenceTypes`, `mongoCollectionName`, `updateIndexes` | Validator compilation and lifecycle helpers (deep import `utils/`). |
| `DEFAULT_DB_ALIAS`, `DEFAULT_PAGE_SIZE`, `DEF_MIGRATIONS_COLLECTION` | Constants. |

## Usage — the maker pattern

```typescript
export const makeProjectStoryResource: ResourceMaker<ProjectStoryRecord, ProjectStoryResource> =
  (dbAlias, serviceAlias) => {
    const resource = makeMongoResource<ProjectStoryRecord, ProjectStoryResource>(
      RES_PROJECT_STORY, dbAlias, serviceAlias, makeProjectStoryResource
    )
    resource.schema = ProjectStorySchema
    resource.reference('projectId', RES_PROJECT)
    resource.index('code', { projectId: 1, code: 1 }, { sparse: true })
    resource.migration('0001-backfill-code', async tx => { /* ... */ })

    return resource
  }
context.registerResource(makeProjectStoryResource())
```

Pass the maker itself as the 4th argument — `reinitializeContext` re-runs it, which is what
carries `schema` and `index()` calls across context switches. `migration()` and `reference()`
survive regardless: they live in module-scope declarations keyed by alias, because losing one
silently loses a data transformation.

## ObjectId references

A field that stores **another record's id** is declared with `reference(field, targetAlias?)`.
The resource then behaves for that field exactly as it does for `_id`:

- **Records and criteria carry strings; the collection stores `ObjectId`s.** Conversion is
  automatic in `create`/`update`/`save` (write), `get`/`load`/`list`/`delete`/`pick` (read and
  lookup), and in `list` criteria — including `$in`/`$ne`-style operator objects, `$and`/`$or`/
  `$nor` branches, and arrays of ids (elementwise). `$regex`/`$type`-style operands are left
  alone.
- **Writes are strict**: storing a non-24-hex value in a declared reference throws
  `MisshapedRecord('ref:<field>')` — a silent string would reintroduce the mixed-type state.
  Reads and criteria are tolerant: an unconverted legacy string comes back as-is; a non-id
  criteria value simply matches nothing (the auth `userId ?? profileId` fallback relies on
  this).
- **`id` criteria address `_id`.** Documents never store an `id` field, so `list({ id })` and
  `load(x, 'id')` are mapped onto `_id` with conversion — before this mapping they silently
  matched nothing.
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

- `entityId` / `entity` — IAM entity slug (also a Keycloak realm and a k8s namespace label)
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
`_owlmeans_migrations` (one ledger per database, so an Entity-layer database tracks its own).

- `Pre` runs **before** the validator is updated and indexes reconcile; `Post` after. A `Pre`
  body writes shapes the *old* validator allows; a `Post` body the *new* one.
- **A `Pre` body that removes an indexed field must drop that index itself.** Indexes reconcile
  *after* `Pre`, so the old one is still live and still enforcing while the body writes. Renaming
  the field in the `index()` declaration does not help when the index **name** stays the same:
  `updateIndexes` matches by name, sees one already there, and leaves the old key spec alone —
  so the declaration says `{ entityId, slug, kind }` while the collection enforces
  `{ entity, slug, kind }`. `$unset`ing the field then collapses every row onto `{ <field>: null,
  … }`, and on a `unique` index the second row dies with E11000 — mid-migration, after earlier
  collections were already rewritten, leaving the database half-migrated and the boot aborting on
  every restart. Drop the stale index by name in the body first (guard on the key spec so the
  drop is idempotent), and let the reconcile recreate it from the declaration.
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
5. reconcile declared references (probe + repair — the double check)

## Method semantics worth remembering

| Method | Semantics |
|---|---|
| `create` | refuses a caller-supplied id (`RecordExists`) |
| `update` | **replaces** the whole record (no merge) |
| `pick` | deletes the record it returns |
| `load`/`get` | rejects `opts.ttl` (`UnsupportedArgumentError`); second arg selects the lookup field |
| `list` | criteria go through reference conversion; documents never store `id` — use `id` criteria freely, they map to `_id` |
| `lock`/`unlock` | encrypt/decrypt `secure: true` schema fields via the db service |

## Tests

Unit specs (conversion layer): `bun test ./tests` in this package — ungated. Integration
specs that build a real `ServerContext` live in `@owlmeans/mongo` (`migration.spec.ts`,
`references.spec.ts`), gated on `MONGO_URL` (see [[testing-integration]]); a dev port-forward
to the cluster mongo satisfies the checked-in `.env`.

## Depends On

- `@owlmeans/resource` · `@owlmeans/context` · `@owlmeans/server-context`
- peer `mongodb`, `ajv`

## Related

- [[mongo]] — the connection service this resolves through
- [[resource]] — `Resource<T>`, `MigratableResource`, the migration framework, errors
- [[postgres-resource]] — the Postgres counterpart (structure reconciliation instead of validators)
