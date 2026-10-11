# @owlmeans/marketing-consent-mongo

MongoDB storage for `@owlmeans/server-marketing-consent`: it registers the two resources the
`MarketingConsentService` resolves by alias — `marketing-consent-state` and `marketing-consent-log` —
with the shared AJV schemas and the indexes the service relies on. A Mongo-backed server (the
OwlMeans platform itself) adds it next to `appendMarketingConsentService`. A Postgres-backed app uses
`@owlmeans/marketing-consent-postgres` instead; tests and in-memory setups can register
`@owlmeans/static-resource` stores under the same aliases.

## Installation

```bash
bun add @owlmeans/marketing-consent-mongo@^0.1.18-rc.17
```

Peer dependencies: `mongodb`, `ajv`.

## Concepts

- **Two resources** — `MongoResource<MarketingConsentStateRecord>` at `RES_MARKETING_CONSENT_STATE`
  and `MongoResource<MarketingConsentLogRecord>` at `RES_MARKETING_CONSENT_LOG`, both aliases
  exported by `@owlmeans/server-marketing-consent`.
- **Shared schema** — `resource.schema` is built from `MarketingConsentStateSchema` /
  `MarketingConsentLogSchema`; `properties` is the same object, nothing is redeclared.
- **Mongo validator adjustment** — `id` is removed from `required`, because a stored Mongo document
  carries only `_id` and the `$jsonSchema` validator would otherwise reject every `create()`.
- **Unique subject** — one state document per `subject`, enforced by a unique index.

## Usage

### Register the resources and the service

```typescript
import { appendMongo } from '@owlmeans/mongo'
import { appendMarketingConsentMongo } from '@owlmeans/marketing-consent-mongo'
import { appendMarketingConsentService } from '@owlmeans/server-marketing-consent'

appendMongo(context)                       // the Mongo connection service, cfg.dbs[...]
appendMarketingConsentMongo(context)       // the two resources
appendMarketingConsentService(context)     // the service that resolves them by alias

await context.configure().init()
```

`appendMarketingConsentMongo` skips a resource whose alias is already registered, so calling it twice
is safe.

### A non-default database or connection service

```typescript
appendMarketingConsentMongo(context, { dbAlias: 'consents', serviceAlias: 'mongo-secondary' })
```

### Use the makers directly

```typescript
import { makeMarketingConsentLogMongo, makeMarketingConsentStateMongo } from '@owlmeans/marketing-consent-mongo'

context.registerResource(makeMarketingConsentStateMongo('consents'))
context.registerResource(makeMarketingConsentLogMongo('consents'))
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `appendMarketingConsentMongo(ctx, opts?)` | function | Registers both resources, each only if its alias is free |
| `makeMarketingConsentStateMongo(dbAlias?, serviceAlias?)` | function | `MongoResource<MarketingConsentStateRecord>` |
| `makeMarketingConsentLogMongo(dbAlias?, serviceAlias?)` | function | `MongoResource<MarketingConsentLogRecord>` |
| `MarketingConsentMongoOptions` | type | `{ dbAlias?, serviceAlias? }` |

### Indexes

| Collection | Index | Keys |
|---|---|---|
| state | `idx_mc_state_subject` (unique) | `{ subject: 1 }` |
| state | `idx_mc_state_user` | `{ userId: 1 }` |
| log | `idx_mc_log_subject_key` | `{ subject: 1, key: 1, decidedAt: -1 }` |
| log | `idx_mc_log_user` | `{ userId: 1, decidedAt: -1 }` |

## Testing

`tests/schema.spec.ts` needs no database: it checks that `properties` is reference-equal to the
shared schema and `required` lacks `id`. `tests/resource.spec.ts` is an integration suite gated on
`MONGO_URL` (it skips without one); it round-trips a dotted key inside `decisions`, checks the
unique `subject` index and that a second `appendMarketingConsentMongo` call is a no-op.

## Common pitfalls

- Assigning `MarketingConsentStateSchema` / `MarketingConsentLogSchema` directly to a
  `MongoResource.schema` — `required: ['id', …]` makes every insert fail validation.
- Reshaping `decisions` into an object keyed by consent key — Mongo dot-notation reads
  `marketing.email` as a path.
- Registering the service without this package (or another storage package) — the service fails on
  its first call when the alias lookup misses.
- Renaming the resource aliases — they come from `@owlmeans/server-marketing-consent` and must stay
  as declared there.

The `marketing-consent-mongo` skill covers this package; the `server-marketing-consent` skill covers
the record shapes and the service.

## Related packages

- [`@owlmeans/server-marketing-consent`](../server-marketing-consent) — the service, record types, schemas and aliases
- [`@owlmeans/marketing-consent-postgres`](../marketing-consent-postgres) — the PostgreSQL counterpart
- [`@owlmeans/mongo-resource`](../mongo-resource) — `makeMongoResource`, `index()`, schema to validator conversion
- [`@owlmeans/mongo`](../mongo) — `appendMongo`, the connection service
- [`@owlmeans/marketing-consent`](../marketing-consent) — the shared consent contracts

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
