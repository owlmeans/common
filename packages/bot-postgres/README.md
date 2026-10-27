# @owlmeans/bot-postgres

PostgreSQL storage for `@owlmeans/server-bot`: it registers the four resources the `BotService`
resolves by alias — `bot-connection`, `bot-rule`, `bot-update` (the inbox) and `bot-activity` — with
the shared AJV schemas and the indexes the service reads by. A Postgres-backed server (typically a
generated target project) adds it next to `appendBot`.

## Installation

```bash
bun add @owlmeans/bot-postgres@^0.1.18-rc.2
```

Peer dependencies: `pg`, `ajv`.

## Concepts

- **Four resources** — `BotConnectionResource`, `BotRuleResource`, `BotUpdateResource` and
  `BotActivityResource`, each a `PostgresResource` of the matching `@owlmeans/server-bot` record, at
  the aliases `RES_BOT_CONNECTION`, `RES_BOT_RULE`, `RES_BOT_UPDATE`, `RES_BOT_ACTIVITY`.
- **Shared schemas** — `resource.schema` is exactly `server-bot`'s record schema; this package
  declares no schema of its own.
- **Column shapes** — nested objects (`identity`, the inbox `update`, the activity `target`) are one
  `jsonb` column each; string lists (`keywords`, `setup`, `credentialsSet`, `handled`) are `text[]`;
  timestamps are ISO `text`; the sealed credentials are one `text` column; the rule's `order` is a
  quoted `double precision` column.
- **Unique inbox key** — `dedupe` carries a unique index, so a redelivered update is one row even
  when two deliveries race.
- **Ids** — records are created without one; Postgres mints it.

## Usage

### Register the resources and the service

```typescript
import { appendPostgres } from '@owlmeans/postgres'
import { appendPostgresBot } from '@owlmeans/bot-postgres'
import { appendBot } from '@owlmeans/server-bot'

appendPostgres(context)              // the Postgres connection service, cfg.dbs[...]
appendPostgresBot(context)           // the four resources
appendBot(context)                   // the service that resolves them by alias

await context.configure().init()     // resource init reconciles tables and indexes (meta.autoSync, default Full)
```

`appendPostgresBot` skips a resource whose alias is already registered, so calling it twice is safe.

### Another database, connection service or alias set

```typescript
const resources = { connection: 'chat-connection', rule: 'chat-rule', update: 'chat-update', activity: 'chat-activity' }

appendPostgresBot(context, { dbAlias: 'bots', serviceAlias: 'postgres-secondary', resources })
appendBot(context, { resources })
```

### One resource per file (a generated target)

The second maker argument is the resource alias, so a target's file wraps the maker into a
`ResourceMaker`:

```typescript
// sources/backend/src/resources/bot/connection.ts
import { makeBotConnectionResource } from '@owlmeans/bot-postgres'
import type { BotConnectionResource } from '@owlmeans/bot-postgres'
import { RES_BOT_CONNECTION } from '@owlmeans/server-bot'
import type { BotConnectionRecord } from '@owlmeans/server-bot'
import type { ResourceMaker } from '@owlmeans/resource'

export const makeResource: ResourceMaker<BotConnectionRecord, BotConnectionResource> =
  (dbAlias, serviceAlias) => makeBotConnectionResource(dbAlias, RES_BOT_CONNECTION, serviceAlias)
```

`rule.ts`, `update.ts` and `activity.ts` follow the same shape.

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `appendPostgresBot(ctx, opts?)` | function | Registers the four resources, each only if its alias is free |
| `makeBotConnectionResource(dbAlias?, alias?, serviceAlias?)` | function | `BotConnectionResource` |
| `makeBotRuleResource(dbAlias?, alias?, serviceAlias?)` | function | `BotRuleResource` |
| `makeBotUpdateResource(dbAlias?, alias?, serviceAlias?)` | function | `BotUpdateResource` (the inbox) |
| `makeBotActivityResource(dbAlias?, alias?, serviceAlias?)` | function | `BotActivityResource` |
| `BotPostgresOptions` | type | `{ dbAlias?, serviceAlias?, resources? }` |

### Indexes

Named `<table>_<suffix>`:

| Table | Suffix | Columns |
|---|---|---|
| `bot_connection` | `scope_created` | `scope`, `createdAt` |
| `bot_connection` | `receive` | `enabled`, `status`, `receive` |
| `bot_rule` | `scope` | `scope` |
| `bot_rule` | `scope_connection` | `scope`, `connection` |
| `bot_update` | `dedupe` (unique) | `dedupe` |
| `bot_update` | `inbox` | `status`, `receivedAt` |
| `bot_update` | `lease` | `status`, `claimedAt` |
| `bot_update` | `connection_received` | `connection`, `receivedAt` |
| `bot_update` | `retention` | `status`, `processedAt` |
| `bot_activity` | `scope_at` | `scope`, `at` |
| `bot_activity` | `scope_connection_at` | `scope`, `connection`, `at` |

## Testing

`tests/schema.spec.ts` needs no database: it compiles the shared schemas and asserts the column
types, the quoted `order` column, the declared indexes and idempotent registration.
`tests/conformance.spec.ts` (the `@owlmeans/server-bot/conformance` store suite, every case including
the unique one) and `tests/tables.spec.ts` (a second boot plans no DDL; the round trips) are
integration suites gated on `POSTGRES_URL`; they skip without one.

## Common pitfalls

- Using a maker directly as a `ResourceMaker` — its second argument is the resource alias, not the
  service alias.
- Registering custom aliases here but not on `appendBot` — the service looks the defaults up and fails.
- Redeclaring a schema locally — the table would drift from what the service reads and writes.

The `bot-postgres` skill covers this package; the `server-bot` skill covers the records and the service.

## Related packages

- [`@owlmeans/server-bot`](../server-bot) — the service, record types, schemas, aliases and the conformance suite
- [`@owlmeans/bot`](../bot) — the chat-bot contract
- [`@owlmeans/postgres-resource`](../postgres-resource) — `makePostgresResource`, `index()`, the schema-to-table compiler
- [`@owlmeans/postgres`](../postgres) — `appendPostgres`, the connection service

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.59
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
