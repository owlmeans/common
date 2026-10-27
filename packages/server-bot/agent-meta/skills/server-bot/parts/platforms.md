---
name: platforms
description: The BotPlatformPlugin interface and the rules every plugin follows (session fetch, deadlines, authenticate, normalize, receiver and fatal faults); how to add a platform without touching the core; the mock transport, mock calls with `auth`, simulate's path and botMockHelper. Each platform's API calls are its own part (telegram, whatsapp, discord, slack).
metadata:
  purposes: server-api, test
  mentions: BotPlatformPlugin, BotPlatformSession, BotMockCall, BOT_BUILTIN_PLATFORMS, makeBotPlatformRegistry, botHookHelper, botMockHelper, signalUtils
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-bot — Platforms

## The plugin interface (`src/platforms/types.ts`)

```ts
interface BotPlatformPlugin {
  platform: BotPlatform
  descriptor: BotPlatformDescriptor                                   // BOT_PLATFORMS[platform], never a copy
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
interface BotNormalizedUpdate { platformId: string, update: Omit<BotUpdate, 'id' | 'connection' | 'scope' | 'platform' | 'matches' | 'receivedAt'> }
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
  gateway platform (Discord) adds its socket factory the same way: one seam, live and mock.
- **Every call has a deadline.** An API client builds its signal with the package's shared
  `signalUtils.deadline(timeoutMs, signal)` (the caller's abort or the call's own time, whichever comes
  first) and waits out a rate limit with `signalUtils.pause(ms, signal)` (an abort rejects at once) —
  `src/utils/signal.ts`; never a local copy.
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
- `setup` steps are plain English sentences; a generated credential (WhatsApp `verifyToken`) is
  `connection.credentials[key]`, which defaults to `connection.hookSecret`.

## Adding a platform

All four platforms the contract declares are implemented; a fifth would first be declared in
`@owlmeans/bot` (`BotPlatform`, `BOT_PLATFORMS`), then:

1. Create `src/platforms/<platform>/` — `consts.ts`, `types.ts` (native shapes + options), `errors.ts`
   (`<Platform>ApiError` with the marker `bot:<platform>:<codes>:<the platform's words>`), the live
   client `api.ts` (over `signalUtils`), `normalize.ts`, `mock.ts`, `plugin.ts` with
   `make<Platform>BotPlatform(opts?)` and the ready instance `<platform>BotPlatform` as its last
   statement, and `index.ts` exporting them.
2. Add the instance to `BOT_BUILTIN_PLATFORMS` in `src/platforms/consts.ts` (its import + one entry).
3. Add `export * from './<platform>/index.js'` to `src/platforms/index.ts`.
4. Add its error class's `typeName` and marker to `@owlmeans/web-bot`'s mirrored lists
   (`platform-refused`).

Nothing else changes: the registry lists every platform of `BOT_PLATFORMS`; a platform a service's
`platforms` option leaves out is `implemented: false` and refused at `save`; with a plugin,
connections, simulate, the runtime and actions work. The action sentence reads the platform's words
from the marker (leading numeric codes and a dotted Web API method are dropped; a detail ending in
`unreachable` / `timeout` reads "could not be reached" / "did not answer in time"). Tests follow
`tests/<platform>.spec.ts` (normalization over documented payloads, authenticate, the mock's answers,
the API client over a test `fetch`) and `tests/<platform>-runtime.spec.ts` (simulate → dispatch → an
action reaching the mock API).

## Mock transport and `@owlmeans/server-bot/mock`

- `transport: 'mock'` on a connection: verify, hooks, receivers and actions go to `plugin.mock.fetch`
  (and Discord's fake socket), activity says `mock`. Mock state (ids, sent messages, the poll queue,
  recorded calls) is per plugin instance and per connection id, in process.
- **Mock ids never repeat across process lifetimes or processes.** The inbox dedupes on the native
  id, so an id a restarted (or another) process mints again is silently swallowed. Every id a mock
  mints — inbound (`inbound`, `feed`) and the fake API's own (sent messages) — is random or
  time-derived, in the platform's shape: Telegram `update_id` / `message_id` start at a random
  point of the signed 32-bit range per state and count up (≤ 2^31-1); WhatsApp `wamid.` carries
  random bytes; Discord snowflakes are now + random low 22 bits, increasing; Slack `ts` is now with
  random sub-millisecond microseconds, increasing, and `event_id` is `Ev` + 10 random characters.
  Never a counter from a fixed start; ids derived from a given text (users, chats) stay stable.
- **`simulate` never takes the hook.** It hands `plugin.mock.inbound(input, connection).body` straight
  to `normalize` and the inbox — the receiver's path — so the worker dispatches it like live traffic,
  for every platform (Discord's hook refuses everything) and across processes. `mock.feed` queues a
  native payload for a `poll` / `gateway` connection's mock receiver in the same process (tests).
  A payload whose dedupe key is already stored answers that row with `duplicate: true` (logged at
  debug) — never a silent no-op.
- A webhook platform's `inbound` is also SIGNED the way the platform signs (Telegram's secret token,
  WhatsApp's app-secret HMAC, Slack's signing secret — a mock connection without the secret signs with
  its hook secret, which only a mock connection's `authenticate` accepts); Discord's is an unsigned
  gateway frame.
- `botMockHelper.inbound(platform, input, signing)` → `{ body, rawBody, headers }`. `signing` is a
  stored connection (`id`, `hookSecret`, `identity`) or the credentials the platform signs with. POST
  `rawBody` with `headers` to a webhook platform's hook route for an end-to-end diagnostic.
  `botMockHelper.feed(platform, signing, input)` queues the same payload for the mock receiver.
- `mock.calls(connection)` → `BotMockCall[]` `{ method, params, at, auth? }`. `auth` says which
  credential made the call where a platform has more than one, in the plugin's words — Slack records
  `bot` (bot token), `user` (admin `userToken`) or `none`; the others leave it absent.

## The platforms

Each implemented platform is its own part: [telegram](telegram.md), [whatsapp](whatsapp.md),
[discord](discord.md), [slack](slack.md).
