---
name: bot-postgres
description: How to use @owlmeans/bot-postgres — the Postgres extension that registers the three @owlmeans/server-bot resources (bot-connection, bot-update, bot-activity) for a GENERATED TARGET PROJECT, their table shapes and indexes, the unique inbox dedupe key, and the target's resource seed files. Auto-invoked when wiring bot storage into a target's Postgres backend, writing a target's resources/bot/*.ts, or touching the bot tables' shape or indexes.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/bot-postgres

**Layer:** Infra extension
**Install:** `"@owlmeans/bot-postgres": "^0.1.18-rc.3"` in `dependencies` (peers `pg`, `ajv`)

The Postgres store of `@owlmeans/server-bot`: three `@owlmeans/postgres-resource` resources over the
record schemas `server-bot` declares, plus the indexes its reads need. It owns no bot behaviour — the
`BotService` resolves the three by alias on every call, so this package and `appendBot` are registered
independently, in any order.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeBotConnectionResource(dbAlias?, alias?, serviceAlias?)` | `BotConnectionResource` (`PostgresResource<BotConnectionRecord>`), alias default `RES_BOT_CONNECTION` |
| `makeBotUpdateResource(dbAlias?, alias?, serviceAlias?)` | `BotUpdateResource` — the inbox, default `RES_BOT_UPDATE` |
| `makeBotActivityResource(dbAlias?, alias?, serviceAlias?)` | `BotActivityResource`, default `RES_BOT_ACTIVITY` |
| `appendPostgresBot(ctx, opts?)` | Registers the three, each only while its alias is free — idempotent |
| `BotPostgresOptions` | `{ dbAlias?, serviceAlias?, resources?: BotResourceAliases }` |

`dbAlias` is the `cfg.dbs` entry (default `postgres`), `serviceAlias` the connection service (default
`postgres`). The second argument is the RESOURCE alias, not the service alias — so a maker is not a
`ResourceMaker` as is; a target file wraps it (below).

## The schema is imported, never redeclared

Each maker assigns `BotConnectionRecordSchema` / `BotUpdateRecordSchema` / `BotActivityRecordSchema`
from `@owlmeans/server-bot` to `resource.schema` — the same object, never a
copy, and no `pg:` override. A change to a record is a change to `server-bot`'s schema; this package
follows it at the next boot (`PgAutoSync.Full` reconciles the table).

## Table shapes

What `postgres-resource`'s default compiler makes of the shared schemas (`tests/schema.spec.ts` pins it):

| Values | Column | Properties |
|---|---|---|
| nested objects | one `jsonb` column each | `identity`, the inbox `update` (open: `raw` is the platform's payload), the activity `target` |
| string lists | native `text[]` | `setup`, `credentialsSet`, `handled` |
| timestamps | `text` (ISO, sortable as stored — no `format`, so never `timestamptz`) | `createdAt`, `updatedAt`, `receivedAt`, `claimedAt`, `retryAt`, `processedAt`, `at` |
| sealed credentials | ONE `text` column, never split per credential key | `sealed` (`v1.<iv>.<tag>.<ciphertext>`) |
| enums | `text` + `CHECK` | `platform`, `transport`, `status`, `receive`, `action` |
| the handler's reference | nullable `text` | the activity `ref` (opaque: the id of the app's own record a handler followed) |

Records are created without an `id` (Postgres mints `gen_random_uuid()::text`); `update`/`save` with an
id REPLACES the whole row. Absent optional fields come back `null`; the service reads `null` as absent.

## Indexes

Index names are `<table>_<suffix>`, so a second set of bot tables under custom aliases in the same
schema never collides; a maker run twice declares each index once.

| Table | Index | Columns | Serves |
|---|---|---|---|
| `bot_connection` | `scope_created` | `scope`, `createdAt` | a scope's connections in order |
| `bot_connection` | `receive` | `enabled`, `status`, `receive` | the worker's receiver reconciliation |
| `bot_update` | `dedupe` **UNIQUE** | `dedupe` | one row per redelivered update |
| `bot_update` | `inbox` | `status`, `receivedAt` | pending rows, oldest first |
| `bot_update` | `lease` | `status`, `claimedAt` | expired `processing` claims |
| `bot_update` | `connection_received` | `connection`, `receivedAt` | a connection's newest update, its inbox purge |
| `bot_update` | `retention` | `status`, `processedAt` | the purge of old `done` rows |
| `bot_activity` | `scope_at` | `scope`, `at` | the activity feed, newest first |
| `bot_activity` | `scope_connection_at` | `scope`, `connection`, `at` | one connection's feed |

The unique `dedupe` is the store's backstop against two concurrent deliveries: the loser's `create`
throws `RecordExists` and the service reads the stored row back. It is what qualifies this store for
the conformance suite's `unique` capability.

## Target wiring

**Backs:** chat-bot connections with sealed credentials, the inbound update inbox and the bots' activity log

| Sub-project | Packages |
|---|---|
| backend | `@owlmeans/bot-postgres`, `@owlmeans/server-bot`, `@owlmeans/bot` |

One file per resource under `sources/backend/src/resources/bot/`: the generated registry imports each
file's zero-argument `makeResource` and registers it before `init()` creates the table. The path
names the alias (`bot/connection.ts` → `bot-connection`), which is exactly `server-bot`'s default, so
`appendBot(context)` needs no `resources` option. The bot service itself, the api trees and the
worker runtime are `server-bot`'s wiring. Keyword groups are NOT stored here: they are the target's
own generated product records, with their own resource file like any other record.

```ts file=sources/backend/src/resources/bot/connection.ts
import { makeBotConnectionResource } from '@owlmeans/bot-postgres'
import type { BotConnectionResource } from '@owlmeans/bot-postgres'
import { RES_BOT_CONNECTION } from '@owlmeans/server-bot'
import type { BotConnectionRecord } from '@owlmeans/server-bot'
import type { ResourceMaker } from '@owlmeans/resource'

/**
 * The bot's connections (`bot-connection`) — credentials sealed with APP_SECRET, never stored in
 * clear. The maker is a thin wrapper: the schema and indexes are the package's own.
 */
export const makeResource: ResourceMaker<BotConnectionRecord, BotConnectionResource> =
  (dbAlias, serviceAlias) => makeBotConnectionResource(dbAlias, RES_BOT_CONNECTION, serviceAlias)
```

```ts file=sources/backend/src/resources/bot/update.ts
import { makeBotUpdateResource } from '@owlmeans/bot-postgres'
import type { BotUpdateResource } from '@owlmeans/bot-postgres'
import { RES_BOT_UPDATE } from '@owlmeans/server-bot'
import type { BotUpdateRecord } from '@owlmeans/server-bot'
import type { ResourceMaker } from '@owlmeans/resource'

/** The inbox (`bot-update`) — one row per inbound update, unique by its dedupe key; the worker drains it. */
export const makeResource: ResourceMaker<BotUpdateRecord, BotUpdateResource> =
  (dbAlias, serviceAlias) => makeBotUpdateResource(dbAlias, RES_BOT_UPDATE, serviceAlias)
```

```ts file=sources/backend/src/resources/bot/activity.ts
import { makeBotActivityResource } from '@owlmeans/bot-postgres'
import type { BotActivityResource } from '@owlmeans/bot-postgres'
import { RES_BOT_ACTIVITY } from '@owlmeans/server-bot'
import type { BotActivityRecord } from '@owlmeans/server-bot'
import type { ResourceMaker } from '@owlmeans/resource'

/** What every bot action did (`bot-activity`) — kept when its connection is removed. */
export const makeResource: ResourceMaker<BotActivityRecord, BotActivityResource> =
  (dbAlias, serviceAlias) => makeBotActivityResource(dbAlias, RES_BOT_ACTIVITY, serviceAlias)
```

All three are required: the service reads and writes every one of them. Never pass a maker to
`ResourceMaker` directly (`makeResource = makeBotConnectionResource`) — a caller's `serviceAlias`
would land in the resource-alias position.

## Wiring outside a target

```ts
import { appendPostgres } from '@owlmeans/postgres'
import { appendPostgresBot } from '@owlmeans/bot-postgres'
import { appendBot } from '@owlmeans/server-bot'

appendPostgres(context)          // the connection service, cfg.dbs[...]
appendPostgresBot(context)       // the three resources
appendBot(context)               // the service, which resolves them by alias per call
await context.configure().init() // init reconciles the three tables and their indexes
```

Custom aliases go to both sides:
`appendPostgresBot(ctx, { resources })` and `appendBot(ctx, { resources })`.

## Testing

Category C. `bun test ./tests`: `schema.spec.ts` needs no database (the column types, the activity's
`ref` column, the declared indexes, the unique dedupe DDL, idempotent registration); `conformance.spec.ts`
runs `server-bot`'s store suite — `botConformanceCasesFor(['unique'])` over
`makeBotConformanceSubject(context)`, every case — and `tables.spec.ts` asserts a second boot plans
no DDL and round-trips the jsonb, `text[]` and `ref` columns. Both are gated on `POSTGRES_URL`
(`gateHelper.postgresGate()`, each spec file its own throwaway schema) and skip cleanly without it.
With no database of this checkout's own, run them against a throwaway container
(`docker run --rm -d -p 127.0.0.1:<port>:5432 -e POSTGRES_PASSWORD=… postgres:<tag>`) — never another
slot's test database. A new conformance case runs here only after `server-bot` is rebuilt.

## Related

- `server-bot` — the service, the record types and schemas, the aliases, the conformance suite (read its skill first)
- `bot` — the contract the records carry (platforms, statuses, enums)
- `postgres-resource` — the table compiler, `index()`, the reconciliation · `postgres` — the connection service
- `marketing-consent-postgres`, `planning-postgres` — the same import-the-schema pattern for other features
