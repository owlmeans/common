---
description: "How to use @owlmeans/mongo-resource — MongoDB-backed Resource with AJV-schema validators, code migrations and ObjectId reference conversion. Use when defining a mongo resource, declaring record references, or writing mongo migrations."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/mongo-resource

**Layer:** Infra
**Install:** `"@owlmeans/mongo-resource": "^0.1.15"` in `dependencies` (peers `mongodb`, `ajv`)

## Key Exports

| Export | Description |
|--------|-------------|
| `makeMongoResource<R, T>(alias, dbAlias?, serviceAlias?, maker?, collectionName?)` | The resource factory (positional args, NOT an options object) |
| `MongoResource<T>` | `Resource<T>` + `collection`, `index`, `reference`/`references`, `migration`/`migrations`, `lock`/`unlock` |
| `MongoTx` | Migration façade: `db`, `collection`, `use(alias)`, `ref(alias)` |
| `marshalReference`, `demarshalReference`, `marshalCriteria`, `identityCriteria`, `isObjectIdHex` | Reference conversion layer — reuse for raw driver access |
| `getDeclaration`, `resetDeclarations` | Module-scope migration/reference declarations per alias |

## Usage

```typescript
export const makeStoryResource: ResourceMaker<StoryRecord, StoryResource> = (dbAlias, serviceAlias) => {
  const resource = makeMongoResource<StoryRecord, StoryResource>(RES_STORY, dbAlias, serviceAlias, makeStoryResource)
  resource.schema = StorySchema
  resource.reference('projectId', RES_PROJECT)   // field stores another record's id
  resource.index('code', { projectId: 1, code: 1 }, { sparse: true })
  resource.migration('0001-backfill', async tx => { /* idempotent body */ })
  return resource
}
```

## ObjectId references

- `reference(field, targetAlias?)` — records/criteria carry strings, the collection stores
  `ObjectId`s (converted like `_id`); the field gets an automatic index (`ref_<field>`)
  unless an identical key pattern is already declared; the validator declares it `objectId`.
- Writes are strict (non-24-hex throws `MisshapedRecord`), reads/criteria tolerant. `id`
  criteria map onto `_id`.
- Declaring one registers the system migration `$ref:<field>@1` (Pre) that converts existing
  strings; the boot additionally probes the collection and repairs drift (the double check).
  Any semantic edit to the shared conversion body must bump the `@N` suffix.
- NEVER declare business/external keys as references: `entityId`/`entity` slugs, composite
  `profileId`, `credentials.userId` (external key — but `profile.userId` IS a reference),
  Stripe/Cloudflare/GitHub ids, minted slugs/tokens.
- Raw `resource.collection.*` access bypasses conversion — marshal filters with
  `marshalReference` and stringify read-back ids by hand.

## Migrations

- `migration(name, apply, stage?)` — applied once per database in declaration order,
  ledgered in `_owlmeans_migrations`. `Pre` runs before validator/index update, `Post` after.
  Fresh collections baseline (record without running).
- No multi-document transactions (standalone mongod) → bodies MUST be idempotent; the ledger
  claims-then-completes on a unique `(alias, name)` index.
- Checksums fingerprint the body's source text: keep bodies at module scope; an edited
  applied body raises `MigrationConflict`.
- `migration()`/`reference()` survive `reinitializeContext` (module-scope declarations);
  `schema`/`index()` survive only when the maker is passed as the 4th factory argument.

## Depends On

- `@owlmeans/mongo` (service), `@owlmeans/resource` (contracts + migration framework), `@owlmeans/server-context`
