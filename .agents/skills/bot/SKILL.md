---
name: bot
description: How to use @owlmeans/bot — the runtime-free, browser-safe contract of OwlMeans chat bots on Telegram, WhatsApp, Discord and Slack. Covers the platform descriptors (credentials, receive modes, supported actions), connections, keyword rules (groups) and the Unicode-aware matcher, the /command parser, normalized updates and activity, the managing and hook protocol trees with their AJV schemas, the bot error family, and how a generated target mounts the operator, member and hook trees. Auto-invoked when importing from @owlmeans/bot, declaring bot routes, matching a message against keyword groups, or deciding what a platform can do.
user-invocable: false
---

# @owlmeans/bot

**Layer:** Cross-cutting domain (contracts only)
**Install:** `"@owlmeans/bot": "^0.1.18-rc.2"` in `dependencies`
**Runtime-free:** no network, no storage, no logging — enums, descriptors, interfaces, AJV schemas
(plain objects), two pure helpers, protocol factories and registered errors. Safe in a browser.

A bot connection is ONE bot account on one platform, owned by a **scope** (the organization — or the
application itself — that runs it). Its **rules** are keyword groups: keywords + what to do with a
matching message. The server half (`@owlmeans/server-bot`) stores, verifies, receives, matches and
acts; `@owlmeans/bot-postgres` persists; `@owlmeans/web-bot` draws the panels; `@owlmeans/bot-agent`
gives an agent the actions as tools. Every one of them speaks the vocabulary declared here.

## Key Exports

| Export | What it is |
|---|---|
| `BotPlatform` | `telegram` · `whatsapp` · `discord` · `slack` |
| `BotReceiveMode` / `BotTransport` / `BotConnectionStatus` | `webhook`·`poll`·`gateway` / `live`·`mock` / `pending`·`connected`·`failed`·`disabled` |
| `BotActionKind` | platform calls: `reply` `send` `delete` `mute` `ban` `react`, plus `note` (activity only) |
| `BotRuleAction` | what a group tells the bot: `delete` `warn` `mute` `ban` `reply` `record` `agent` |
| `BotMatchMode` / `BotUpdateKind` / `BotChatKind` | `word`·`contains` / `message`·`edited`·`command`·`member` / `private`·`group`·`channel` |
| `BOT_PLATFORMS` | `Record<BotPlatform, BotPlatformDescriptor>` — credentials, receive modes, actions, setup, docs |
| `BotConnection` / `BotConnectionInput` | the client view (never a credential) / the write (credentials write-only) |
| `BotRule` / `BotRuleInput` / `BotMatch` | a keyword group / its write / a matched group with its matched keywords |
| `BotUpdate`, `BotMessage`, `BotMessageRef`, `BotChatRef`, `BotSenderRef`, `BotCommand` | the normalized inbound update a handler receives |
| `BotActivity`, `BotSimulateInput`, `BotSimulateResult` | one recorded action (a failure carries `error`, a sentence, and `code`, its `bot:<marker>:` marker); the simulator's input and answer `{ update, duplicate? }` |
| `botRuleHelper` | `match(text, rules)`, `normalizeKeywords(list)`, `appliesTo(rule, connection)` |
| `botCommandHelper` | `parse(text, botUsername?) → BotCommand \| null` |
| `botPlatformHelper` | `actionsOf(platform, credentialsSet?)`, `supports(platform, kind, credentialsSet?)` |
| `makeBotProtocols(opts)` → `BotProtocols` | the managing tree (connections, rules, activity) |
| `makeBotHookProtocols(opts)` → `BotHookProtocols` | the platforms' inbound tree (`receive`, `challenge`) |
| `Bot*Schema` | `BotConnectionInputSchema`, `BotRuleInputSchema`, `BotSimulateInputSchema`, `BotIdParamsSchema`, `BotRuleListQuerySchema`, `BotActivityQuerySchema`, `BotHookParamsSchema`, `BotChallengeQuerySchema` |
| `BotError` family | `BotConnectionNotFound` 404, `BotCredentialsRejected` 422, `BotSignatureRejected` 401, `BotTransportMismatch` 409, `BotUnsupportedAction` 422 |
| `BOT_*` limits | `BOT_KEYWORDS_MAX` 200, `BOT_KEYWORD_MAX` 100, `BOT_ACTIVITY_LIMIT_MAX` 200 / `_DEFAULT` 50, `BOT_ID_PATTERN` … |
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

## Matching rules

`botRuleHelper.match(text, rules)` is the ONE matcher — the server's dispatch, the panels and the
tests call it, so a group means the same thing everywhere.

- Both sides fold: NFKC, then a case fold (`ß` ≡ `ss`, `Ё` ≡ `ё`, full-width ≡ ASCII). Accents are
  kept: `cafe` does not match `café`.
- `word`: tokens are runs of letters, combining marks, digits and `_`; punctuation splits. A
  multi-word keyword is a PHRASE — consecutive tokens (`free money` matches `FREE, money!`, not
  `money for free`). A keyword with no letters or digits never matches a word.
- `contains`: a substring of the folded text, whitespace runs collapsed — also the mode for scripts
  written without spaces (Chinese, Japanese, Thai), where a word is the whole run.
- Disabled rules never match; results are sorted by `order` (ties keep the given order); each
  `BotMatch.keywords` lists the rule's keywords, as stored, that matched.
- Which rules apply to a connection is `appliesTo`: its own, or a scope-wide one (`connection`
  `null`/absent). The runtime filters with it before matching.
- `normalizeKeywords(list)` is what a store keeps: trimmed, inner whitespace collapsed, ≤
  `BOT_KEYWORD_MAX` code points, empties and folded duplicates dropped (first spelling kept), ≤
  `BOT_KEYWORDS_MAX` items.

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
// connection.simulate POST   /connections/:id/simulate  BotSimulateInput → BotSimulateResult (mock only)
// rule.list           GET    /rules?connection=          → BotRule[]
// rule.save           POST   /rules         BotRuleInput → BotRule
// rule.remove         DELETE /rules/:id                  → { id }
// activity.list       GET    /activity?connection=&limit= → BotActivity[] (newest first, limit ≤ 200)
makeBotHookProtocols({ base: { alias, path, parent?, service? } }): BotHookProtocols
// receive    POST /:platform/:connection   (native payload, no body schema)
// challenge  GET  /:platform/:connection   (WhatsApp hub.* handshake → the challenge string)
```

- Aliases derive from the base: `<alias>:connection:list`, `<alias>:rule:save`, `<alias>:receive` …
  Two mounts are two base aliases.
- `gates` is the gate the base carries (`{ alias, params? }` — a protocol has exactly one gate).
- **The hook tree carries no guard and no gate, on purpose: the platform signs.** Telegram's secret
  token, WhatsApp's app-secret HMAC and Slack's signing secret are verified by the server against the
  connection's credentials over the RAW body — never put an auth guard in front of it, never add a
  body schema.
- List queries are required on the client: `rule.list.call({ query: {} })`.

## Rules for consumers

- **Actions never throw.** Every `BotActions` call of `@owlmeans/server-bot` answers
  `{ ok, error?, code? }` and records a `BotActivity` with both; a handler checks `ok`, never wraps in
  try/catch to "handle" a platform refusal, and asks `supports(kind)` before an action its platform
  may lack. `error` is one sentence for a person or a model; `code` is the marker code compares.
- A handler reacts to `update.matches` (already filtered and ordered) — it never re-matches text
  and never calls a platform API by hand.
- `BotConnection` never carries a credential; `credentialsSet` says which keys hold a value. In a
  `BotConnectionInput`, an omitted credential key keeps its stored value; `''` is spellable (clear).
- `simulate` exists only for `transport: 'mock'`; on a live connection it is `BotTransportMismatch`.
  The server hands the platform's native payload straight to normalization and the inbox — no hook.
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
- The web screens host `BotConnectionsPanel` / `BotRulesPanel` / `BotActivityPanel` with
  `surface = appProtocols.api.bot.operator` (or `.member`); handlers live in
  `sources/backend/src/bot/handlers/` and run in the worker (`bot.runtime(handlers)`).

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route` — the protocol trees
- `@owlmeans/error` — the `BotError` family
- `@owlmeans/context`
- `ajv` (peer, types only) — the `JSONSchemaType` of the schemas

## Related

- [[entrypoint]] — immutable protocols, `bind` / `bindAll`
- [[planning]] — the same per-mount protocol-factory shape (`makePlanningProtocols`)
- [[viable-common]] — `BlueprintCase.Bot` / `AiBot`, `BotKit`, the card's `botPlatforms` / `botKit`
