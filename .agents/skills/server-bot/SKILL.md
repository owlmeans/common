---
name: server-bot
description: How to use @owlmeans/server-bot — the server runtime of OwlMeans chat bots on Telegram, WhatsApp, Discord and Slack (all four plugins ship). appendBot and BotService (connections with AES-GCM sealed credentials, activity), the signed inbound hook and its deduplicating inbox, simulate on mock connections (API only — the mock's native payload straight into normalize and the inbox), the worker-only runtime (dispatcher handing each update to the application's handlers as is + poll/gateway receivers, fatal receiver faults that fail the connection), the never-throwing BotActions answering a sentence plus its machine code and recording the handler's opaque ref, serveBotEntrypoints / serveBotHookEntrypoints, the record schemas a store registers, the BotPlatformPlugin interface, the API-faithful mock transport (./mock) and the store conformance suite (./conformance). Auto-invoked when wiring bots into a backend, writing a bot handler, adding or changing a platform plugin, storing bot records, or testing against the mock transport.
user-invocable: false
---

# @owlmeans/server-bot

**Layer:** Server
**Install:** `"@owlmeans/server-bot": "^0.1.18-rc.3"` in `dependencies` (`ajv` is a peer)
**Contract:** `@owlmeans/bot` — platforms, connections, updates, activity, the text helper, the two protocol trees, the errors

The runtime of the bot case. It stores (over ANY `@owlmeans/resource` — `@owlmeans/bot-postgres` in a
target, static resources in tests), seals credentials, receives signed platform requests into an
inbox, dispatches them to handlers in the worker and acts on the platform. Platforms are plugins, and
all four the contract declares ship in `BOT_BUILTIN_PLATFORMS`: Telegram, WhatsApp, Discord, Slack.
It holds no keyword group and decides nothing about a message: what the bot does is the
application's handler code over the application's own records.

## Key exports

| Export | What it is |
|---|---|
| `appendBot(ctx, options?, alias = BOT_SERVICE)` → `BotService` | Register (or answer the registered) lazy service; `makeBotService(options?, alias?)` builds it |
| `BotService` | `connections` (list/get/save/verify/remove), `activity.list`, `receive`, `simulate`, `runtime(handlers)`, `actions(target)` |
| `BotServiceOptions` | `resources` (aliases), `secret` (default `process.env.APP_SECRET`), `hookUrl`, `platforms` (default `BOT_BUILTIN_PLATFORMS`), `fetch`, `pollMs` 750, `reconcileMs` 15 000, `attempts` 3, `leaseMs` 5 min, `retainMs` 7 days, `now` |
| `botHandler(name, handle)`, `BotHandler`, `BotActions`, `BotActionOptions` (`ref?`), `BotActionResult`, `BotMemberTarget`, `BotRuntime` | What a handler is and does |
| `serveBotEntrypoints(tree, { scope, service? })`, `serveBotHookEntrypoints(tree, { service? }?)` | `BasicEntrypoint[]` for a managing tree / the hook tree |
| `BotConnectionRecord`, `BotUpdateRecord`, `BotActivityRecord` + `Bot*RecordSchema` | The stored records and their AJV schemas — a store imports them, never redeclares |
| `RES_BOT_CONNECTION` `bot-connection` · `RES_BOT_UPDATE` `bot-update` · `RES_BOT_ACTIVITY` `bot-activity`, `BotInboxStatus` | Default aliases; inbox `pending · processing · done · failed` |
| `BotPlatformPlugin` and its types (`BotMockCall` with `auth?`), `makeBotPlatformRegistry`, `BOT_BUILTIN_PLATFORMS`, `botHookHelper` | The platform seam — [platforms](parts/platforms.md) |
| `telegramBotPlatform`, `makeTelegramBotPlatform({ base })`, `TelegramApiError`, `TELEGRAM_*` | Telegram (Bot API: webhook or long polling) |
| `whatsappBotPlatform`, `makeWhatsAppBotPlatform({ base, version })`, `WhatsAppApiError`, `whatsappSignatureHelper`, `WHATSAPP_*` | WhatsApp (Cloud API: manual webhook) |
| `discordBotPlatform`, `makeDiscordBotPlatform({ base, socket, reconnectMs, userAgent })`, `DiscordApiError`, `DiscordGatewayError`, `discordSetupHelper`, `DISCORD_*` | Discord (REST v10 + gateway) |
| `slackBotPlatform`, `makeSlackBotPlatform({ base, retries, maxRetryWaitS })`, `SlackApiError`, `slackSignatureHelper`, `slackTextHelper`, `SLACK_*` | Slack (Events API + Web API: manual Request URL) |
| `botCryptoHelper` (`sealerOf(secret).seal/open`, `randomSecret`), `botOriginHelper` (`originOf`, `isPublicHttps`, `hookUrl`) | Helpers |
| `BotConnectionDisabled` 409, `BotSecretMissing` 500, `BotCredentialsUnreadable` 500 | The server's own refusals, beside the contract's (web-bot carries their copy) |
| `./mock`: `botMockHelper` (`inbound`, `feed`, `calls`, `plugin`), `makeBotMockHelper(plugins)` | Native payloads (signed where the platform signs) — tests, the runtime smoke and the e2e hook diagnostic |
| `./conformance`: `botConformance`, `botConformanceCasesFor(capabilities)`, `makeBotConformanceSubject(ctx, opts?)` | The runner-agnostic store suite |

## Connections and credentials

- **Sealed, never returned.** AES-256-GCM, key = HKDF-SHA256(secret, salt `owlmeans-bot`, info
  `credentials`), the scope as AAD, stored as `sealed` = `v1.<iv>.<tag>.<ciphertext>` (base64url). No
  secret → `BotSecretMissing`: credentials are never stored in clear. A view lists only `credentialsSet`.
- In `save`, an omitted credential key keeps its value, `''` clears it, an unknown key is
  `BotCredentialsRejected`. Changing a credential or the transport puts the connection back to
  `pending`, clears its identity and `lastError` and unregisters a hook its old bot had.
- Every connection gets a random `hookSecret`: Telegram's `secret_token`, and the default of a
  `generated` credential — it doubles as the WhatsApp verify token the `setup` steps show the operator
  (such a credential always reads as set). It only proves an inbound request came from the platform
  (and signs a mock connection's payloads); it is never a credential of the bot's account and never
  leaves the server in a view.
- `verify(scope, id, origin?)`: the plugin's `verify` (mock connections need no credentials; live ones
  their required ones) → `connected` with `identity`, `lastError` cleared; then the receive mode — an
  `auto` webhook platform registers its hook when `hookUrl` is public HTTPS (and the plugin accepts
  it), otherwise the connection `poll`s where the platform can (Telegram), `gateway`s (Discord) or stays
  `webhook` with `setup` steps (WhatsApp, Slack). A failure is stored (`failed`, `lastError`) and thrown.
- `origin` is the request's (`x-forwarded-proto` + `x-forwarded-host` / `host`), so preview,
  production and a custom domain each get their own `hookUrl` = `${origin}/api/bot/hook/<platform>/<id>`.
- `remove` unregisters the hook (best effort), deletes the connection and its inbox rows; its
  activity stays. Records of the application that point at the connection (a connection-bound
  keyword group) are the application's to clean up. A platform the registry has no plugin for cannot be saved
  (`BotUnsupportedAction` `platform-not-implemented:<platform>`) — a deployment may pass `platforms`
  with fewer than the four.

## Inbox and runtime

- `receive(platform, connection, request)` = load → plugin `authenticate` (a reject is
  `BotSignatureRejected` 401; a challenge is answered, nothing stored) → `normalize` → one inbox row
  per update, deduplicated by `dedupe` = `<connection>:<platform>:<platform update id>` → `{ ok: true }`
  at once. A disabled connection's update is acknowledged and dropped. No handler runs here. Discord's
  hook refuses every request — it posts no webhooks.
- `simulate` (mock transport only, else `BotTransportMismatch`; disabled → `BotConnectionDisabled`) is
  an API route for the runtime smoke and end-to-end tests — no UI offers it. It builds the platform's NATIVE payload with `plugin.mock.inbound` and hands its body straight to
  `normalize` and the inbox — the path a receiver's payload and an authenticated hook's payload take —
  so the worker dispatches it like live traffic. No hook is involved: it works for a gateway-only
  platform and when the API and the worker are two processes. It answers `{ update, duplicate }`:
  `duplicate: true` (logged at debug) when the dedupe key was already stored — `update` is that
  existing row and nothing new is dispatched. `receive` still answers `{ ok: true }` to a duplicate
  (platform retries are normal). Mock ids are random or time-derived, never a fixed-start counter, so
  a restart never re-mints a stored id ([platforms](parts/platforms.md)).
- **`runtime(handlers)` belongs to the worker only.** `start()` dispatches every `pollMs` and
  reconciles receivers every `reconcileMs`; `stop()` lets the pass in flight finish and aborts every
  receiver. `dispatch()` / `reconcile()` run one pass by hand (tests, a host's own schedule).
- Dispatch: pending rows (and `processing` rows whose lease expired), oldest first; one connection's
  rows in order, connections side by side. A row is claimed (`processing`, `attempts + 1`), the
  update is the stored normalized payload under the row's id (`{ ...payload, id }` — nothing is
  matched or added), then every handler runs in order with `actions(update)`. All done → `done`; a throw → `pending` again after a
  backoff, up to `attempts`, then `failed` with the error. A retry skips the handlers already
  completed — **by name**, so handler names are unique and stable.
- Receivers: one per enabled, `connected` `poll` / `gateway` connection whose plugin has a `receiver`,
  each with its own `AbortController`; a changed connection restarts its receiver after the old one let
  go. `done` rows past `retainMs` are purged at reconciliation.
- **A receiver's fault is recoverable or fatal.** Recoverable (a network fault, a gateway that kept
  dropping): stored as `lastError` = `receiver:<error>`, status stays `connected`, and the next
  reconciliation restarts it — the plugin's own reconnect backoff (Discord's gateway) runs inside a run.
  Fatal — `BotCredentialsRejected`, or what the plugin's `fatal(error)` answers true for (Telegram
  401/404, Discord close codes 4004 and 4010–4014 or a REST 401): the connection becomes `failed`
  with that `lastError`, and reconciliation, which starts `connected` connections only, never restarts
  it. A `verify` (→ `connected`) or a credential/transport `save` (→ `pending`, then `verify`) brings it
  back. A fault of a receiver whose connection changed meanwhile is not recorded on the new bot.
- One worker per database: the claim is a read-then-write, not a lock. Two workers may run an update
  twice; the lease only recovers a crashed one.

## Actions never throw

`actions(update | { scope, connection })` answers `BotActions`. Every call returns
`{ ok, error?, code?, message? }` and records ONE `BotActivity` (`transport` `live` | `mock`, `ref` from
`opts.ref`, the update id when bound to or given an update, `error` and `code`) — whatever happened:

- **`error` is ONE short sentence** a person or an agent's model reads — "WhatsApp cannot delete
  messages.", "Slack can delete messages only with the userToken credential.", "The text is empty.",
  "Telegram refused: Bad Request: message to delete not found.", "Discord could not be reached.".
  **`code` is the machine marker** of the same failure (`bot:unsupported-action:delete`,
  `bot:invalid-action:empty-text`, `bot:telegram:400:…`) — code compares `code`, never the sentence.
- `supports(kind)` = `botPlatformHelper.supports(platform, kind, credentialsSet)`; an unsupported call
  is `ok: false` (`code` `bot:unsupported-action:<kind>`) plus a failed activity, and makes no call.
- An unknown connection, a disabled one, an empty text, an update with no message or no sender, a
  platform refusal and a network fault are `ok: false` — never an exception.
- `reply` answers in the message's thread; `mute` takes `minutes ≥ 1`; `note` makes no platform call.
- A mock connection's actions go to the plugin's fake API: recorded, no network.
- `opts.ref` is opaque: the handler passes what it followed (the id of the application's keyword
  group, say) and the activity keeps it; nothing here reads it.

## Logging

Scoped loggers `server-bot`, `server-bot:runtime`, `server-bot:discord` (gateway, debug only). Info:
connection verified / refused / removed, receiver started / stopped, runtime started / stopped. Warn:
a handler or action failed (with its `code`), a receiver failed, a receiver refused for good. Never
logged: credentials, tokens, the hook secret, message text (the platform clients rethrow a transport
error without the URL or headers that carry a token).

## Target wiring

A target with the `bot` / `ai-bot` case (docs/bots.md §4): the backend registers the three
`@owlmeans/bot-postgres` resources and the service, the api binds the trees, the worker runs the
handlers barrel. Keyword groups are the target's own generated records (type, model, API, screens).

```ts
// sources/backend/src/services/bot.ts
import { appendBot } from '@owlmeans/server-bot'
appendBot(context)                        // after the bot-postgres resources; APP_SECRET is injected

// sources/api/src/case.ts — scope from the actor (app/bot/scope.ts)
import { serveBotEntrypoints, serveBotHookEntrypoints } from '@owlmeans/server-bot'
context.registerEntrypoints([
  ...serveBotEntrypoints(botProtocols.operator, { scope: operatorScope }),   // the app's own org without tenancy
  ...serveBotEntrypoints(botProtocols.member, { scope: memberScope }),       // the acting organization
  ...serveBotHookEntrypoints(botProtocols.hook),                            // unguarded: the platform signs
])

// sources/worker/src/case.ts
import { BOT_SERVICE, type BotService } from '@owlmeans/server-bot'
import { handlers } from '<backend package>/bot/handlers/index.js'   // the generated barrel: an ordered array
await context.service<BotService>(BOT_SERVICE).runtime(handlers).start()

// sources/backend/src/bot/handlers/<slug>.ts — the groups are the target's own records
export const moderate = botHandler('moderate', async (update, bot, ctx) => {
  const text = update.message?.text ?? ''
  for (const group of await makeKeywordGroupModel(ctx).enabledOf(update.scope)) {
    if (botTextHelper.matched(text, group.keywords).length === 0) continue
    const done = bot.supports(BotActionKind.Delete) ? await bot.delete(update, { ref: group.id }) : { ok: false }
    if (!done.ok) await bot.reply(update, group.warning ?? 'Please keep to the rules.', { ref: group.id })
  }
})
```

- Hook URL `https://<host>/api/bot/hook/<platform>/<connection>`: the api mounts the hook tree at
  `/bot/hook` under `/api`; another mount needs the `hookUrl` option.
- A handler reads the application's records itself (through the backend model, scoped by
  `update.scope`), matches with `botTextHelper.matched`, acts with `{ ref }`, checks `ok`, asks
  `supports` — it never calls a platform API, never wraps an action in try/catch, and never parses
  `error` (`code` is the marker).
- The runtime is created ONLY in the worker; the api process stores inbound updates and answers.
- Panels (`@owlmeans/web-bot`) call the managing tree. No UI creates a mock connection or simulates a
  message: both are API calls of the runtime smoke and the end-to-end tests.

## Testing

Category A, `bun test ./tests` — static resources, the mock transport, no network: sealing,
connections, receive/simulate/dedupe (a simulate after a restart — a fresh plugin over the
same store, `makeTestBot(options, bot.store)` — is dispatched; a replayed payload is `duplicate`),
the mock ids' shapes and uniqueness across lifetimes (`mock-ids.spec.ts`), the runtime (dispatch, retry, unsupported actions and
their sentences), receivers (`receivers.spec.ts`: a revoked token fails the connection until it is
verified again, an unreachable platform is retried — over a test `fetch` answering the Bot API's own
envelopes), each platform's normalization, authentication and mock over its documented payloads,
each platform end to end on a mock connection (`*-runtime.spec.ts`: a handler matching its own
keyword list with `botTextHelper` and acting with `{ ref }`), the bound handlers, and the
conformance suite over static resources (every case but `unique`). A deployment with fewer plugins is
`makeTestBot({ platforms: [telegramBotPlatform] })`. A store package runs
`botConformanceCasesFor(['unique'])` over its own resources. `tsc -p tests/tsconfig.json` type-checks
the specs.

## Parts

| Part | Load it when |
|---|---|
| [platforms](parts/platforms.md) | writing or changing a platform plugin, its receiver or `fatal`, adding a platform, using the mock transport, `botMockHelper` or mock calls |
| [telegram](parts/telegram.md) | checking which Bot API calls the Telegram plugin makes, its hook secret, normalization or addressing |
| [whatsapp](parts/whatsapp.md) | checking which Cloud API calls the WhatsApp plugin makes, its handshake and signature, normalization or mock |
| [discord](parts/discord.md) | checking which REST calls the Discord plugin makes, its invite permissions, gateway receiver, normalization or mock |
| [slack](parts/slack.md) | checking which Web API calls the Slack plugin makes, its signature, admin token, normalization or mock |
