---
name: bot
description: How to use @owlmeans/bot — the runtime-free, browser-safe contract of OwlMeans chat bots on Telegram, WhatsApp, Discord and Slack. Covers the platform descriptors (credentials, receive modes, supported actions), connections, the Unicode-aware text helper a handler matches message text with, the /command parser, normalized updates and activity (with the handler's opaque `ref`), the managing and hook protocol trees with their AJV schemas, the bot error family, and how a generated target mounts the operator, member and hook trees. Auto-invoked when importing from @owlmeans/bot, declaring bot routes, matching a message against phrases (an application's own keyword groups), or deciding what a platform can do.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/bot

**Layer:** Cross-cutting domain (contracts only)
**Install:** `"@owlmeans/bot": "^0.1.18"` in `dependencies`
**Runtime-free:** no network, no storage, no logging — enums, descriptors, interfaces, AJV schemas
(plain objects), three pure helpers, protocol factories and registered errors. Safe in a browser.

A bot connection is ONE bot account on one platform, owned by a **scope** (the organization — or the
application itself — that runs it). What the bot does with a message is the APPLICATION's code: a
handler reads the application's own records (its keyword groups, its requests) and calls the
actions. No package here stores a keyword group or decides on a message. The server half
(`@owlmeans/server-bot`) stores connections, verifies, receives and acts; `@owlmeans/bot-postgres`
persists; `@owlmeans/web-bot` draws the connection and activity panels; `@owlmeans/bot-agent` gives
an agent the actions as tools. Every one of them speaks the vocabulary declared here.

## Key Exports

| Export | What it is |
|---|---|
| `BotPlatform` | `telegram` · `whatsapp` · `discord` · `slack` |
| `BotReceiveMode` / `BotTransport` / `BotConnectionStatus` | `webhook`·`poll`·`gateway` / `live`·`mock` / `pending`·`connected`·`failed`·`disabled` |
| `BotActionKind` | platform calls: `reply` `send` `delete` `mute` `ban` `react`, plus `note` (activity only) |
| `BotTextMatch` / `BotUpdateKind` / `BotChatKind` | `word`·`contains` / `message`·`edited`·`command`·`member` / `private`·`group`·`channel` |
| `BOT_PLATFORMS` | `Record<BotPlatform, BotPlatformDescriptor>` — credentials, receive modes, actions, setup, docs |
| `BotConnection` / `BotConnectionInput` | the client view (never a credential) / the write (credentials write-only) |
| `BotUpdate`, `BotMessage`, `BotMessageRef`, `BotChatRef`, `BotSenderRef`, `BotCommand` | the normalized inbound update a handler receives |
| `BotActivity`, `BotSimulateInput`, `BotSimulateResult` | one recorded action (a failure carries `error`, a sentence, and `code`, its `bot:<marker>:` marker; `ref` is the handler's opaque reference); the API-only simulate input and answer `{ update, duplicate? }` |
| `botTextHelper` | `fold(text)`, `tokensOf(text)`, `matched(text, phrases, mode?)`, `phrasesOf(input)` |
| `botCommandHelper` | `parse(text, botUsername?) → BotCommand \| null` |
| `botPlatformHelper` | `actionsOf(platform, credentialsSet?)`, `supports(platform, kind, credentialsSet?)` |
| `makeBotProtocols(opts)` → `BotProtocols` | the managing tree (connections, activity) |
| `makeBotHookProtocols(opts)` → `BotHookProtocols` | the platforms' inbound tree (`receive`, `challenge`) |
| `Bot*Schema` | `BotConnectionInputSchema`, `BotSimulateInputSchema`, `BotIdParamsSchema`, `BotActivityQuerySchema`, `BotHookParamsSchema`, `BotChallengeQuerySchema` |
| `BotError` family | `BotConnectionNotFound` 404, `BotCredentialsRejected` 422, `BotSignatureRejected` 401, `BotTransportMismatch` 409, `BotUnsupportedAction` 422 |
| `BOT_*` limits | `BOT_TEXT_MAX` 4096, `BOT_LABEL_MAX` 120, `BOT_ACTIVITY_LIMIT_MAX` 200 / `_DEFAULT` 50, `BOT_ID_PATTERN` … |
| `BOT_MANAGE_PERMISSION` | `'bot--manage'` — the permission the member mount's gate requires (organization owners hold it by default where users work in organizations; otherwise granted explicitly) |

## Platforms

| Platform | Credentials | Receive | Actions | Setup |
|---|---|---|---|---|
| telegram | `token` | webhook, poll | reply send delete mute ban react | auto (`setWebhook` + secret token) |
| whatsapp | `accessToken`, `phoneNumberId`, `appSecret`, `verifyToken` (generated) | webhook | reply send react | manual (callback URL + verify token) |
| discord | `token`, `applicationId` | gateway | reply send delete mute (timeout) ban react | auto (gateway; invite URL) |
| slack | `botToken`, `signingSecret`, optional admin `userToken` | webhook (Events API) | reply send react; `delete` only with `userToken` | manual (Request URL) |

- Ask `botPlatformHelper.supports(platform, kind, connection.credentialsSet)` — never a local table.
  It adds what an optional credential `enables` and always answers `note` true.
- A moderation kit on a platform that cannot delete (WhatsApp; Slack without `userToken`) falls back
  to `warn` (a reply). WhatsApp cannot delete, mute or ban at all.
- A `generated` credential (WhatsApp `verifyToken`) is created by the server and shown in the
  connection's `setup` steps; nobody types it.

## Matching text

`botTextHelper` is the ONE way message text is compared with phrases — a generated handler matching
the application's own keyword groups, the runtime smoke and the tests call it, so a phrase means the
same thing everywhere. The packages hold no keyword group: the application's records carry the
phrases, its handler loads them and asks `matched`.

- Both sides fold (`fold`): NFKC, then a case fold, then NFKC (`ß` ≡ `ss`, `Ё` ≡ `ё`, full-width ≡
  ASCII, ligatures ≡ letters). Accents are kept: `cafe` does not match `café`.
- `matched(text, phrases, BotTextMatch.Word)` (the default): tokens are runs of letters, combining
  marks, digits and `_`; punctuation splits. A multi-word phrase must appear as CONSECUTIVE tokens
  (`free money` matches `FREE, money!`, not `money for free`). A phrase with no letters or digits
  never matches a word.
- `BotTextMatch.Contains`: a substring of the folded text, whitespace runs collapsed — also the mode
  for scripts written without spaces (Chinese, Japanese, Thai), where a word is the whole run.
- The answer lists the phrases found, in the order given, each once (a folded repeat is skipped, the
  first spelling answers). Blank phrases and an empty text match nothing.
- `phrasesOf(input)` turns what a person typed (a string, or a list whose items may hold several)
  into phrases: split on commas and line breaks, trimmed, inner whitespace collapsed, empties and
  folded duplicates dropped (first spelling kept). A form or a model normalizes keywords with it
  before saving them.

`botCommandHelper.parse('/report@MyBot some args', 'MyBot')` → `{ name: 'report', args: 'some args' }`.
The name is lower-cased and must end at whitespace or the end (`/usr/bin` is no command); a command
addressed to another bot answers `null`; with no `botUsername`, any address is accepted.

## Protocols

```ts
makeBotProtocols({ base: { alias, path, parent?, service? }, guards?, gates? }): BotProtocols
// base                                   (carries the guards and the ONE gate)
// connection.list     GET    /connections                → BotConnection[]
// connection.save     POST   /connections   BotConnectionInput → BotConnection
// connection.verify   POST   /connections/:id/verify     → BotConnection
// connection.remove   DELETE /connections/:id            → { id }
// connection.simulate POST   /connections/:id/simulate  BotSimulateInput → BotSimulateResult (mock only, API only)
// activity.list       GET    /activity?connection=&limit= → BotActivity[] (newest first, limit ≤ 200)
makeBotHookProtocols({ base: { alias, path, parent?, service? } }): BotHookProtocols
// receive    POST /:platform/:connection   (native payload, no body schema)
// challenge  GET  /:platform/:connection   (WhatsApp hub.* handshake → the challenge string)
```

- Aliases derive from the base: `<alias>:connection:list`, `<alias>:activity:list`, `<alias>:receive` …
  Two mounts are two base aliases.
- `gates` is the gate the base carries (`{ alias, params? }` — a protocol has exactly one gate).
- **The hook tree carries no guard and no gate, on purpose: the platform signs.** Telegram's secret
  token, WhatsApp's app-secret HMAC and Slack's signing secret are verified by the server against the
  connection's credentials over the RAW body — never put an auth guard in front of it, never add a
  body schema.
- List queries are required on the client: `activity.list.call({ query: {} })`.

## Rules for consumers

- **Actions never throw.** Every `BotActions` call of `@owlmeans/server-bot` answers
  `{ ok, error?, code? }` and records a `BotActivity` with both; a handler checks `ok`, never wraps in
  try/catch to "handle" a platform refusal, and asks `supports(kind)` before an action its platform
  may lack. `error` is one sentence for a person or a model; `code` is the marker code compares.
- A handler decides on the update itself: it reads the application's own records (keyword groups
  for `update.scope`, and its connection where the records are bound to one), compares the text
  with `botTextHelper.matched`, and acts through `BotActions` with `{ ref }` — the id of the record
  it followed, recorded on the activity. It never calls a platform API by hand.
- `BotConnection` never carries a credential; `credentialsSet` says which keys hold a value. In a
  `BotConnectionInput`, an omitted credential key keeps its stored value; `''` is spellable (clear).
- `simulate` exists only for `transport: 'mock'`; on a live connection it is `BotTransportMismatch`.
  It is reachable through the API alone — the runtime smoke and end-to-end tests call it; no UI
  offers a mock transport or a simulator. The server hands the platform's native payload straight to
  normalization and the inbox — no hook.
  `BotSimulateResult.duplicate: true` means the payload was already in the inbox: `update` is the
  existing row and nothing new is dispatched — a caller waiting for a reaction stops there.
- Chat members are not application users: nothing of theirs is a guest endpoint; their messages
  arrive only through the hook or the worker's receivers.
- `scope` is decided by the server from the acting organization (`makeEntityScope` / the target's
  actor) — it is never read from the wire.
- `BotMessageRef` alone addresses a message: it carries `space` (Discord guild / Slack team) where
  the platform needs it.
- Error messages are `bot:<marker>:<detail>`; the UI copy ships with `web-bot` as
  `lib : bot.errors.<key>` (`botErrorHelper.keyOf` reads the class, then `@owlmeans/server-bot`'s type
  names, then the marker — an activity's `code`, a connection's `lastError`).

## Target wiring

A generated target (`bot` / `ai-bot` case seed) declares three trees in
`sources/common/src/bot-protocols.ts` and spreads them into its case protocol surface:

```ts
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { BOT_MANAGE_PERMISSION, makeBotHookProtocols, makeBotProtocols } from '@owlmeans/bot'
import { OIDC_GATE } from '@owlmeans/oidc'
import { OPERATOR_PERMISSION } from './consts.js'

export const botProtocols = Object.freeze({
  // tenancy none / operators: the operator area runs the bot (/backoffice)
  operator: makeBotProtocols({
    base: { alias: 'api:bot:operator', path: '/bot/operator' },
    guards: DEFAULT_GUARD, gates: { alias: OIDC_GATE, params: [OPERATOR_PERMISSION] },
  }),
  // tenancy users: each customer organization runs its own bot (/frontoffice)
  member: makeBotProtocols({
    base: { alias: 'api:bot:member', path: '/bot/member' },
    guards: DEFAULT_GUARD, gates: { alias: OIDC_GATE, params: [BOT_MANAGE_PERMISSION] },
  }),
  // the platforms: unguarded, signed
  hook: makeBotHookProtocols({ base: { alias: 'api:bot:hook', path: '/bot/hook' } }),
})
```

- The member mount's gate requires `BOT_MANAGE_PERMISSION` (`'bot--manage'`) — import it, never
  respell it: the platform and the target seed read the same constant. Where users work in
  organizations, an organization's owners hold it by default; otherwise it is only granted explicitly.
- The api binds each managing tree with `serveBotEntrypoints(tree, { scope })` (`@owlmeans/server-bot`),
  `scope` from the target's actor — the application's own organization for `operator` without
  tenancy, the acting organization otherwise — and the hook tree with `serveBotHookEntrypoints`.
- Hook URL: `https://<host>/api/bot/hook/<platform>/<connection>` — the host of the request that
  saved or verified the connection, so preview, production and custom domains all work.
- The web screens host `BotConnectionsPanel` (the connection dialog) and `BotActivityPanel` with
  `surface = appProtocols.api.bot.operator` (or `.member`). Keyword groups are the target's OWN
  generated records — type, API, collection and form screens like any product record.
- Handlers live in `sources/backend/src/bot/handlers/`, listed by the generated barrel
  `handlers/index.ts`, and run in the worker (`bot.runtime(handlers)`). A keyword handler loads the
  groups for `update.scope` through the backend model, matches with `botTextHelper.matched` and
  acts with `{ ref: group.id }`:

```ts
// sources/backend/src/bot/handlers/moderate.ts — the keyword group is the app's own record
import { botTextHelper } from '@owlmeans/bot'
import { botHandler } from '@owlmeans/server-bot'

export const moderate = botHandler('moderate', async (update, bot, ctx) => {
  const text = update.message?.text ?? ''
  for (const group of await makeKeywordGroupModel(ctx).enabledOf(update.scope)) {
    if (botTextHelper.matched(text, group.keywords).length > 0) {
      await bot.delete(update, { ref: group.id })
    }
  }
})
```

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route` — the protocol trees
- `@owlmeans/error` — the `BotError` family
- `@owlmeans/context`
- `ajv` (peer, types only) — the `JSONSchemaType` of the schemas

## Related

- [[entrypoint]] — immutable protocols, `bind` / `bindAll`
- [[planning]] — the same per-mount protocol-factory shape (`makePlanningProtocols`)
- [[viable-common]] — `BlueprintCase.Bot` / `AiBot`, `BotKit`, the card's `botPlatforms` / `botKit`
