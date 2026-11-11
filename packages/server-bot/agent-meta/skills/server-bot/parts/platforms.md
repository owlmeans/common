---
name: platforms
description: The BotPlatformPlugin interface and the rules every plugin follows (session fetch, deadlines, authenticate, normalize, receiver and fatal faults, the one wire error); how a platform is added as a plugin package (connect) without touching the core; the registry; the mock transport, mock calls with `auth`, simulate's path, makeBotMockHelper and the configurable test platform. Each platform's own API calls are its plugin package's skill (bot-telegram, bot-whatsapp, bot-discord, bot-slack in connect).
metadata:
  purposes: server-api, test
  mentions: BotPlatformPlugin, BotPlatformSession, BotMockCall, makeBotPlatformRegistry, botHookHelper, botSignalHelper, makeBotMockHelper, makeTestBotPlatform, BotErrorPlatform
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-bot — Platforms

## The plugin interface (`src/platforms/types.ts`, exported)

```ts
interface BotPlatformPlugin {
  platform: BotPlatformId                                             // stored and in the hook URL — never renamed
  descriptor: BotPlatformDescriptor                                   // the plugin's own — what platform.list serves
  verify: (session: BotPlatformSession) => Promise<BotPlatformIdentity>   // refusal → throw BotCredentialsRejected
  registerHook?: (session: BotPlatformSession, url: string) => Promise<void>   // auto-setup webhook platforms
  unregisterHook?: (session: BotPlatformSession) => Promise<void>
  acceptsHookUrl?: (url: string) => boolean                           // default: any public HTTPS
  setup?: (connection: BotPlatformConnection) => string[]             // steps a person takes in the console
  authenticate: (request: BotHookRequest, connection: BotPlatformConnection) => BotAuthentication | Promise<BotAuthentication>
  normalize: (payload: unknown, connection: BotConnection) => BotNormalizedUpdate[]
  receiver?: (session: BotPlatformSession, emit: BotReceiverEmit, signal: AbortSignal) => Promise<void>
  fatal?: (error: unknown) => boolean                                 // a receiver fault no restart fixes
  act: (session: BotPlatformSession, action: BotPlatformAction) => Promise<BotPlatformActionResult>
  mock: BotPlatformMock
}
interface BotPlatformSession { connection: BotPlatformConnection, transport: BotTransport, fetch: BotFetch }
interface BotPlatformConnection extends BotConnection { credentials: Record<string, string>, hookSecret: string }
type BotAuthentication = { result: 'ok' } | { result: 'challenge', reply?: BotHookReply, text?: string } | { result: 'reject', reason: string }
interface BotNormalizedUpdate { platformId: string, update: Omit<BotUpdate, 'id' | 'connection' | 'scope' | 'platform' | 'receivedAt'> }
type BotPlatformAction =
  | { kind: Reply, to: BotMessageRef, text } | { kind: Send, chat: BotChatRef, text } | { kind: Delete, message: BotMessageRef }
  | { kind: Mute, chat, user, space?, until: Date } | { kind: Ban, chat, user, space? } | { kind: React, message: BotMessageRef, emoji }
interface BotPlatformMock {
  fetch: (connection: BotPlatformConnection) => BotFetch               // the fake API, records every call
  inbound: (input: BotSimulateInput, connection: BotPlatformConnection) => BotNativeInbound   // { body, rawBody, headers }
  feed: (connection: string, payload: unknown) => void                // queue for the mock receiver (in process)
  calls: (connection: string) => BotMockCall[]
  reset: (connection?: string) => void
}
interface BotMockCall { method: string, params: Record<string, unknown>, at: string, auth?: string }
```

Rules every plugin follows:

- **All HTTP goes through `session.fetch`.** Live it is the global `fetch` (or the service's `fetch`
  option); mock it is the plugin's own fake. Write the live client once — the mock answers the same
  URLs with the platform's own envelopes, so a mock connection runs every line but the socket. A
  gateway platform adds its socket factory the same way: one seam, live and mock.
- **Every call has a deadline.** An API client builds its signal with the exported
  `botSignalHelper.deadline(timeoutMs, signal)` (the caller's abort or the call's own time, whichever
  comes first) and waits out a rate limit with `botSignalHelper.pause(ms, signal)` (an abort rejects at
  once) — never a local copy.
- **A platform's API refusal is `BotErrorPlatform`** (`@owlmeans/bot`), `bot:platform:<id>:<codes or
  the API method>:<the platform's words>`. A plugin's own error class (`<Platform>ApiError`, with its
  parsed `code` / `retryAfter`) EXTENDS it and declares NO `typeName` of its own — it travels as
  `BotErrorPlatform`, is rebuilt as that class wherever the plugin is not loaded, and needs no
  registration. A refusal decided before any call stays in the contract's family
  (`BotCredentialsRejected`, `BotUnsupportedAction`, `bot:invalid-action:no-space:<kind>` for an action
  the platform takes only inside a server).
- A plugin holds no storage, no credentials and no timers; `session.connection.credentials` are opened
  per call. It may throw anywhere — the service records the failure; actions turn it into `ok: false`.
- `authenticate` is timing-safe (`botHookHelper.sameSecret`) and checks over `rawBody` where the
  platform signs bytes (`botHookHelper.rawText`); `botHookHelper.header` reads headers case-insensitively.
- `normalize` answers `[]` for a kind the bot ignores; `platformId` must be stable across redeliveries.
- `receiver` awaits `emit(payload)` before confirming an update to the platform, returns when `signal`
  aborts, and throws on a fault. The runtime records a recoverable fault as `lastError` and restarts the
  receiver at the next reconciliation; a fatal one — `BotCredentialsRejected`, or what `fatal(error)`
  answers true for — marks the connection `failed`, and no receiver runs for it until it is verified
  or saved again. A plugin with a receiver declares `fatal` for the refusals no retry fixes (a revoked
  token, a configuration the platform refuses) and nothing else.
- A transport error must not carry a URL or header holding a token into an error message.
- `setup` steps are plain English sentences; a generated credential (a verify token) is
  `connection.credentials[key]`, which defaults to `connection.hookSecret`.

## Adding a platform — a plugin package, nothing in common

A platform is a package of the connect repository (`@owlmeans/bot-<platform>`, `@owlmeans/` scope,
depending on `@owlmeans/bot` and `@owlmeans/server-bot` only); nothing in common changes:

1. `src/consts.ts` — `<P>_PLATFORM` (the id), the protocol constants, and `<P>_DESCRIPTOR`: `title`,
   a neutral `glyph`, the credentials with `label` / `hint` in every panel language (`en`, `pl`, `ru`,
   `be`, `uk`, `es`, `de`, `fr`), `receive`, `actions`, `setup`, `docs`, the platform `hint`, a `link`
   when a person follows one before saving (an invite).
2. `src/types.ts` (native shapes + options), `src/errors.ts` (`<Platform>ApiError extends
   BotErrorPlatform`, no `typeName`), the live client `src/api.ts` (over `botSignalHelper`),
   `normalize.ts`, `mock.ts`, `plugin.ts` with `make<Platform>BotPlatform(opts?)` and the ready instance
   `<platform>BotPlatform` as its last statement, `append.ts` with `append<Platform>BotPlatform(ctx,
   opts?)` (= `appendBot(ctx).register(make…(opts))`), and `index.ts` exporting them.
3. Register it where the deployment wants it (`makeBotService({ platforms })`) — explicit, never a
   side-effect import.

The panels draw it from its descriptor (`platform.list`), the action sentences name it by `title`
and read its words from the marker (leading numeric codes and a dotted API method are dropped; a
detail ending in `unreachable` / `timeout` reads "could not be reached" / "did not answer in time"),
a stored legacy `bot:<id>:…` refusal is explained by its id. Tests (in the plugin package): the
descriptor complete in eight languages, normalization over documented payloads, authenticate, the
mock's answers and ids, the API client over a test `fetch`, and the platform end to end through the
service on a mock connection.

## The test platform — `makeTestBotPlatform(options?)` (`./mock`)

A complete plugin over an invented chat API (`POST <base>/<method>`, JSON, `{ ok, result }` /
`{ ok: false, error }`; `base` default `https://bot.invalid/<platform>`) with an in-memory fake of
it — what every generic suite (server-bot, bot-agent, bot-postgres, the conformance kit) runs on;
production never registers it. Options: `platform` (`test`), `title` (`Test`), `glyph`, `credentials`
(default one required secret `token`; a `generated` one shows in manual setup; an optional one with
`enables` adds its actions and is the bearer those calls send — the mock records it as `auth`),
`receive` (default webhook then poll; `[gateway]` holds a "socket"), `actions` (all six), `setup`
(`auto` / `manual`: `Callback URL: <hookUrl>` + `<Label>: <generated value>`), `link`, `hint`,
`spaceActions` (refuse `no-space` without the chat's server), `base`. The fake's methods: `me`
(username `mock_<id>_bot`), `setHook` / `deleteHook`, `updates` (a short long-poll over what `feed`
queued), `sendMessage`, `deleteMessage`, `muteMember`, `banMember`, `react`. Deliveries are signed by
echoing the hook secret in `x-bot-test-secret`; a GET `?mode=subscribe&token=<verify token>&challenge=…`
is the handshake. A 401/404 answer is `BotCredentialsRejected` at verify and fatal in the receiver;
a transport fault `bot:platform:<id>:503:<method>: unreachable` (`504 … timeout`).

## Mock transport and `@owlmeans/server-bot/mock`

- `transport: 'mock'` on a connection (written through the API — the runtime smoke and end-to-end
  tests; no panel offers it): verify, hooks, receivers and actions go to `plugin.mock.fetch`
  (and a gateway plugin's fake socket), activity says `mock`. Mock state (ids, sent messages, the poll queue,
  recorded calls) is per plugin instance and per connection id, in process.
- **Mock ids never repeat across process lifetimes or processes.** The inbox dedupes on the native
  id, so an id a restarted (or another) process mints again is silently swallowed. Every id a mock
  mints — inbound (`inbound`, `feed`) and the fake API's own (sent messages) — is random or
  time-derived, in the platform's shape (each plugin's skill names its scheme; the test platform's
  ids count up from the clock). Never a counter from a fixed start; ids derived from a given text
  (users, chats) stay stable.
- **`simulate` never takes the hook.** It hands `plugin.mock.inbound(input, connection).body` straight
  to `normalize` and the inbox — the receiver's path — so the worker dispatches it like live traffic,
  for every platform (a gateway-only platform's hook refuses everything) and across processes. `mock.feed` queues a
  native payload for a `poll` / `gateway` connection's mock receiver in the same process (tests).
  A payload whose dedupe key is already stored answers that row with `duplicate: true` (logged at
  debug) — never a silent no-op.
- A webhook platform's `inbound` is also SIGNED the way the platform signs (a mock connection without
  the platform's secret signs with its hook secret, which only a mock connection's `authenticate`
  accepts); a gateway platform's is an unsigned gateway frame.
- `makeBotMockHelper(plugins)` — over the very plugin instances the service was given (mock state
  lives in the instance). `.inbound(platform, input, signing)` → `{ body, rawBody, headers }`; `signing`
  is a stored connection (`id`, `hookSecret`, `identity`) or the credentials the platform signs with.
  POST `rawBody` with `headers` to a webhook platform's hook route for an end-to-end diagnostic.
  `.feed(platform, signing, input)` queues the same payload for the mock receiver; `.plugin(id)` throws
  `BotUnsupportedAction` for a platform it was not given.
- `mock.calls(connection)` → `BotMockCall[]` `{ method, params, at, auth? }`. `auth` says which
  credential made the call where a platform has more than one, in the plugin's words (a bot token, an
  admin user token, `none`); a platform with one credential leaves it absent.

## The platforms

Each platform's API calls, normalization and mock are its plugin package's skill (connect):
`bot-telegram`, `bot-whatsapp`, `bot-discord`, `bot-slack`.
