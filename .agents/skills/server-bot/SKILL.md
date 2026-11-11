---
name: server-bot
description: How to use @owlmeans/server-bot — the platform-neutral server runtime of OwlMeans chat bots; each platform is a plugin package registered explicitly. appendBot and BotService (the registered platforms, platform.list, (connections with AES-GCM sealed credentials, activity), the signed inbound hook and its deduplicating inbox, simulate on mock connections (API only — the mock's native payload straight into normalize and the inbox), the worker-only runtime (dispatcher handing each update to the application's handlers as is + poll/gateway receivers, fatal receiver faults that fail the connection), the never-throwing BotActions answering a sentence plus its machine code and recording the handler's opaque ref, serveBotEntrypoints / serveBotHookEntrypoints, the record schemas a store registers, the BotPlatformPlugin interface and registry, the API-faithful mock transport and the configurable test platform (./mock) and the store conformance suite (./conformance). Auto-invoked when wiring bots into a backend, writing a bot handler, writing a platform plugin, storing bot records, or testing against the mock transport.
user-invocable: false
---

# @owlmeans/server-bot

**Layer:** Server
**Install:** `"@owlmeans/server-bot": "^0.2.0-alpha.0"` in `dependencies` (`ajv` is a peer)
**Contract:** `@owlmeans/bot` — platform descriptors, connections, updates, activity, the text helper, the two protocol trees, the errors

The runtime of the bot case. It stores (over ANY `@owlmeans/resource` — `@owlmeans/bot-postgres` in a
target, static resources in tests), seals credentials, receives signed platform requests into an
inbox, dispatches them to handlers in the worker and acts on the platform. It names no platform:
each one is a plugin package of its own (`@owlmeans/bot-<platform>`, the connect repository),
registered EXPLICITLY — `makeBotService({ platforms: [...] })` or `service.register(plugin)` — and the
service supports exactly the registered plugins. It holds no keyword group and decides nothing about
a message: what the bot does is the application's handler code over the application's own records.

## Key exports

| Export | What it is |
|---|---|
| `appendBot(ctx, options?, alias = BOT_SERVICE)` → `BotService` | Register (or answer the registered) lazy service; `makeBotService(options?, alias?)` builds it |
| `BotService` | `connections` (list/get/save/verify/remove), `activity.list`, `platforms()` (the registered descriptors), `register(plugin)`, `receive`, `simulate`, `runtime(handlers)`, `actions(target)` |
| `BotServiceOptions` | `resources` (aliases), `secret` (default `process.env.APP_SECRET`), `hookUrl`, `platforms` (the plugin instances — none: a boot warning, every save refused), `fetch`, `pollMs` 750, `reconcileMs` 15 000, `attempts` 3, `leaseMs` 5 min, `retainMs` 7 days, `now` |
| `botHandler(name, handle)`, `BotHandler`, `BotActions`, `BotActionOptions` (`ref?`), `BotActionResult`, `BotMemberTarget`, `BotRuntime` | What a handler is and does |
| `serveBotEntrypoints(tree, { scope, service? })`, `serveBotHookEntrypoints(tree, { service? }?)` | `BasicEntrypoint[]` for a managing tree (`platform.list` bound when the tree carries it — it asks no scope) / the hook tree |
| `BotConnectionRecord`, `BotUpdateRecord`, `BotActivityRecord` + `Bot*RecordSchema` | The stored records and their AJV schemas — a store imports them, never redeclares |
| `RES_BOT_CONNECTION` `bot-connection` · `RES_BOT_UPDATE` `bot-update` · `RES_BOT_ACTIVITY` `bot-activity`, `BotInboxStatus` | Default aliases; inbox `pending · processing · done · failed` |
| `BotPlatformPlugin` and its types (`BotMockCall` with `auth?`), `makeBotPlatformRegistry`, `botHookHelper`, `botSignalHelper` | The platform seam a plugin package builds on — [platforms](parts/platforms.md) |
| `botCryptoHelper` (`sealerOf(secret).seal/open`, `randomSecret`), `botOriginHelper` (`originOf`, `isPublicHttps`, `hookUrl`) | Helpers |
| `BotConnectionDisabled` 409, `BotSecretMissing` 500, `BotCredentialsUnreadable` 500 | The server's own refusals, beside the contract's (web-bot carries their copy) |
| `./mock`: `makeBotMockHelper(plugins)` (`inbound`, `feed`, `calls`, `plugin`) | Native payloads (signed where the platform signs) of the plugins it is given — tests, the runtime smoke and the e2e hook diagnostic |
| `./mock`: `makeTestBotPlatform(options?)`, `BOT_TEST_PLATFORM` (`test`), `BOT_TEST_SECRET_HEADER` | A complete plugin over an invented chat API, configurable to every shape — [platforms](parts/platforms.md) |
| `./conformance`: `botConformance`, `botConformanceCasesFor(capabilities)`, `makeBotConformanceSubject(ctx, opts?)` (`platform?`, default the test platform) | The runner-agnostic store suite |

The platform plugins live in the connect repository, one package each, with their own skills:
`bot-telegram`, `bot-whatsapp`, `bot-discord`, `bot-slack`.

## The registered platforms

- `options.platforms` (and `register`) is the ONLY list: a platform without a plugin is unsupported —
  its save answers `BotUnsupportedAction` `platform-not-implemented:<id>`, its hook
  `BotConnectionNotFound`, a stored connection on it keeps its record and its actions answer
  `unsupported-action` (`note` still works). A later plugin for an id replaces the earlier one.
- `platforms()` answers the registered plugins' descriptors, in registration order — what
  `platform.list` serves and every panel draws. `actions(…).descriptor()` answers the connection's.
- With no plugin registered the service logs ONE warning (`bot.platforms.missing`) where it boots —
  the worker's `runtime(handlers)` and the first `platforms()` read — and refuses every save.

## Connections and credentials

- **Sealed, never returned.** AES-256-GCM, key = HKDF-SHA256(secret, salt `owlmeans-bot`, info
  `credentials`), the scope as AAD, stored as `sealed` = `v1.<iv>.<tag>.<ciphertext>` (base64url). No
  secret → `BotSecretMissing`: credentials are never stored in clear. A view lists only `credentialsSet`.
- In `save`, an omitted credential key keeps its value, `''` clears it, an unknown key is
  `BotCredentialsRejected`. Changing a credential or the transport puts the connection back to
  `pending`, clears its identity and `lastError` and unregisters a hook its old bot had.
- Every connection gets a random `hookSecret`: what a platform echoing a secret on every delivery is
  given, and the default of a `generated` credential — it doubles as the verify token the `setup` steps
  show the operator (such a credential always reads as set). It only proves an inbound request came from the platform
  (and signs a mock connection's payloads); it is never a credential of the bot's account and never
  leaves the server in a view.
- `verify(scope, id, origin?)`: the plugin's `verify` (mock connections need no credentials; live ones
  their required ones) → `connected` with `identity`, `lastError` cleared; then the receive mode — an
  `auto` webhook platform registers its hook when `hookUrl` is public HTTPS (and the plugin accepts
  it), otherwise the connection `poll`s where the platform can, `gateway`s where that is its mode, or
  stays `webhook` with `setup` steps (a manual platform). A failure is stored (`failed`, `lastError`)
  and thrown.
- `origin` is the request's (`x-forwarded-proto` + `x-forwarded-host` / `host`), so preview,
  production and a custom domain each get their own `hookUrl` = `${origin}/api/bot/hook/<platform>/<id>`.
- `remove` unregisters the hook (best effort), deletes the connection and its inbox rows; its
  activity stays. Records of the application that point at the connection (a connection-bound
  keyword group) are the application's to clean up.

## Inbox and runtime

- `receive(platform, connection, request)` = load → plugin `authenticate` (a reject is
  `BotSignatureRejected` 401; a challenge is answered, nothing stored) → `normalize` → one inbox row
  per update, deduplicated by `dedupe` = `<connection>:<platform>:<platform update id>` → `{ ok: true }`
  at once. A disabled connection's update is acknowledged and dropped. No handler runs here. A
  gateway-only platform's hook refuses every request — it posts no webhooks.
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
  reconciliation restarts it — the plugin's own reconnect backoff (a gateway's) runs inside a run.
  Fatal — `BotCredentialsRejected`, or what the plugin's `fatal(error)` answers true for (a 401 on the
  poll, a gateway's authentication close codes): the connection becomes `failed`
  with that `lastError`, and reconciliation, which starts `connected` connections only, never restarts
  it. A `verify` (→ `connected`) or a credential/transport `save` (→ `pending`, then `verify`) brings it
  back. A fault of a receiver whose connection changed meanwhile is not recorded on the new bot.
- One worker per database: the claim is a read-then-write, not a lock. Two workers may run an update
  twice; the lease only recovers a crashed one.

## Actions never throw

`actions(update | { scope, connection })` answers `BotActions`. Every call returns
`{ ok, error?, code?, message? }` and records ONE `BotActivity` (`transport` `live` | `mock`, `ref` from
`opts.ref`, the update id when bound to or given an update, `error` and `code`) — whatever happened:

- **`error` is ONE short sentence** a person or an agent's model reads, the platform named by its
  descriptor's `title` — "Acme cannot delete messages.", "Acme can delete messages only with the
  adminToken credential.", "The text is empty.", "Acme refused: message to delete not found.", "Acme
  could not be reached.", "Acme can mute members only in a server, and this chat is in none.".
  **`code` is the machine marker** of the same failure (`bot:unsupported-action:delete`,
  `bot:invalid-action:empty-text`, `bot:invalid-action:no-space:mute`, `bot:platform:<id>:400:…`) — code
  compares `code`, never the sentence.
- `supports(kind)` = `botPlatformHelper.supports(plugin.descriptor, kind, credentialsSet)`; an
  unsupported call is `ok: false` (`code` `bot:unsupported-action:<kind>`) plus a failed activity, and
  makes no call. `descriptor()` answers the connection's platform descriptor (`null` for an unknown
  connection or an unregistered platform).
- An unknown connection, a disabled one, an empty text, an update with no message or no sender, a
  platform refusal and a network fault are `ok: false` — never an exception.
- `reply` answers in the message's thread; `mute` takes `minutes ≥ 1`; `note` makes no platform call.
- A mock connection's actions go to the plugin's fake API: recorded, no network.
- `opts.ref` is opaque: the handler passes what it followed (the id of the application's keyword
  group, say) and the activity keeps it; nothing here reads it.

## Logging

Scoped loggers `server-bot`, `server-bot:runtime` (a plugin package logs under its own scope). Info:
connection verified / refused / removed, receiver started / stopped, runtime started / stopped. Warn:
a handler or action failed (with its `code`), a receiver failed, a receiver refused for good, no
platform plugin registered (`bot.platforms.missing`, once). Never
logged: credentials, tokens, the hook secret, message text (the platform clients rethrow a transport
error without the URL or headers that carry a token).

## Target wiring

A target with the `bot` / `ai-bot` case (docs/bots.md §4): the backend registers the three
`@owlmeans/bot-postgres` resources and the service, the api binds the trees, the worker runs the
handlers barrel. Keyword groups are the target's own generated records (type, model, API, screens).

```ts
// sources/backend/src/services/bot.ts — the generated registry registers what `makeService` answers
import { discordBotPlatform } from '@owlmeans/bot-discord'
import { slackBotPlatform } from '@owlmeans/bot-slack'
import { telegramBotPlatform } from '@owlmeans/bot-telegram'
import { whatsappBotPlatform } from '@owlmeans/bot-whatsapp'
import { makeBotService } from '@owlmeans/server-bot'
export const makeService = () => makeBotService({
  secret: () => process.env.APP_SECRET ?? '',                   // injected into api and worker
  platforms: [telegramBotPlatform, whatsappBotPlatform, discordBotPlatform, slackBotPlatform],
})

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
- Panels (`@owlmeans/web-bot`) call the managing tree — `platform.list` among it. No UI creates a mock
  connection or simulates a message: both are API calls of the runtime smoke and the end-to-end tests.
- A target generated on the 0.1 line (built-in platforms, no `platforms` option, a `BotPlatform` enum)
  is moved by viable-agent's `refreshCaseSeeds` before anything else touches it: the bot service from
  the template (registering the four plugins), the case slot restating `platform.list`, generated enum
  uses rewritten to string ids.

## Testing

Category A, `bun test ./tests` — static resources, the test platform (`makeTestBotPlatform`, a fresh
instance per `makeTestBot`), no network: sealing, connections (auto webhook, poll, gateway, manual setup
with a generated credential, an optional credential enabling an action), receive/simulate/dedupe (a
simulate after a restart — a fresh plugin over the same store, `makeTestBot(options, bot.store)` — is
dispatched; a replayed payload is `duplicate`), the registry and `platform.list`, the boot warning
without a platform, the runtime (dispatch, retry, unsupported actions and their sentences, a
platform's refusal through `BotErrorPlatform` and a plugin subclass), receivers (`receivers.spec.ts`: a
revoked token fails the connection until it is verified again, an unreachable platform is retried —
over a test `fetch` answering the test platform's envelopes), the bound handlers, and the conformance
suite over static resources (every case but `unique`). No spec here names a real platform: each
platform's normalization, authentication, mock and end-to-end runs are its plugin package's specs. A
store package runs `botConformanceCasesFor(['unique'])` over its own resources. `tsc -p
tests/tsconfig.json` type-checks the specs.

## Parts

| Part | Load it when |
|---|---|
| [platforms](parts/platforms.md) | writing or changing a platform plugin package, its descriptor, receiver or `fatal`, using the mock transport, `makeBotMockHelper`, the test platform or mock calls |

A specific platform's API calls, normalization and mock are its plugin package's skill (connect):
`bot-telegram`, `bot-whatsapp`, `bot-discord`, `bot-slack`.
