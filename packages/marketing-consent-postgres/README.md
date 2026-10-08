# @owlmeans/marketing-consent-postgres

PostgreSQL storage for `@owlmeans/server-marketing-consent`: it registers the two resources the
`MarketingConsentService` resolves by alias — `marketing-consent-state` and `marketing-consent-log` —
with the shared AJV schemas and the indexes the service relies on. A Postgres-backed server
(typically a generated target project) adds it next to `appendMarketingConsentService`. A
Mongo-backed server uses `@owlmeans/marketing-consent-mongo` instead.

## Installation

```bash
bun add @owlmeans/marketing-consent-postgres@^0.1.18-rc.16
```

Peer dependencies: `pg`, `ajv`.

## Concepts

- **Two resources** — `PostgresResource<MarketingConsentStateRecord>` at
  `RES_MARKETING_CONSENT_STATE` and `PostgresResource<MarketingConsentLogRecord>` at
  `RES_MARKETING_CONSENT_LOG`, both aliases exported by `@owlmeans/server-marketing-consent`.
- **Shared schema** — `resource.schema` is exactly `MarketingConsentStateSchema` /
  `MarketingConsentLogSchema`; this package declares no schema of its own.
- **jsonb columns** — `decisions`, `terms`, `documents` and `notices` each compile to one opaque
  `jsonb` column by `@owlmeans/postgres-resource`'s default table rule; nothing is split into child
  tables or per-field columns.
- **Unique subject** — one state row per `subject`, enforced by a unique index; the row `id` is
  minted by Postgres.

## Usage

### Register the resources and the service

```typescript
import { appendPostgres } from '@owlmeans/postgres'
import { appendMarketingConsentPostgres } from '@owlmeans/marketing-consent-postgres'
import { appendMarketingConsentService } from '@owlmeans/server-marketing-consent'

appendPostgres(context)                    // the Postgres connection service, cfg.dbs[...]
appendMarketingConsentPostgres(context)    // the two resources
appendMarketingConsentService(context)     // the service that resolves them by alias

await context.configure().init()           // resource init reconciles tables and indexes (meta.autoSync, default Full)
```

`appendMarketingConsentPostgres` skips a resource whose alias is already registered, so calling it
twice is safe.

### A non-default database or connection service

```typescript
appendMarketingConsentPostgres(context, { dbAlias: 'consents', serviceAlias: 'postgres-secondary' })
```

### Use the makers directly

```typescript
import { makeMarketingConsentLogPostgres, makeMarketingConsentStatePostgres } from '@owlmeans/marketing-consent-postgres'

context.registerResource(makeMarketingConsentStatePostgres('consents'))
context.registerResource(makeMarketingConsentLogPostgres('consents'))
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `appendMarketingConsentPostgres(ctx, opts?)` | function | Registers both resources, each only if its alias is free |
| `makeMarketingConsentStatePostgres(dbAlias?, serviceAlias?)` | function | `PostgresResource<MarketingConsentStateRecord>` |
| `makeMarketingConsentLogPostgres(dbAlias?, serviceAlias?)` | function | `PostgresResource<MarketingConsentLogRecord>` |
| `MarketingConsentPostgresOptions` | type | `{ dbAlias?, serviceAlias? }` |

### Indexes

| Table | Index | Columns |
|---|---|---|
| state | `idx_mc_state_subject` (unique) | `subject` |
| state | `idx_mc_state_user` | `userId` |
| log | `idx_mc_log_subject_key` | `subject`, `key`, `decidedAt` |
| log | `idx_mc_log_user` | `userId`, `decidedAt` |

## Testing

`tests/schema.spec.ts` needs no database: it runs `pgSchemaHelper.schemaToTableSpec` over the shared
schemas and asserts the jsonb columns, the exact top-level column list and the declared indexes.
`tests/resource.spec.ts` is an integration suite gated on `POSTGRES_URL` (it skips without one) that
boots a real `ServerContext` with `PgAutoSync.Full` on a throwaway schema.

## Common pitfalls

- Adding a `pg:` override or a schema edit that turns `decisions` into columns or a keyed jsonb
  object — dotted keys such as `marketing.email` would be read as jsonb paths.
- Redeclaring the schema locally — the storage would drift from what the service reads and writes.
- Registering the service without a storage package — the service fails on its first call when the
  alias lookup misses.
- Renaming the resource aliases — they come from `@owlmeans/server-marketing-consent` and must stay
  as declared there.

The `marketing-consent-postgres` skill covers this package; the `server-marketing-consent` skill
covers the record shapes and the service.

## Related packages

- [`@owlmeans/server-marketing-consent`](../server-marketing-consent) — the service, record types, schemas and aliases
- [`@owlmeans/marketing-consent-mongo`](../marketing-consent-mongo) — the MongoDB counterpart
- [`@owlmeans/postgres-resource`](../postgres-resource) — `makePostgresResource`, `index()`, the schema-to-table compiler
- [`@owlmeans/postgres`](../postgres) — `appendPostgres`, the connection service
- [`@owlmeans/marketing-consent`](../marketing-consent) — the shared consent contracts

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.51
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
