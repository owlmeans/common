# @owlmeans/bot

The runtime-free, browser-safe contract of OwlMeans chat bots: the descriptor a platform plugin
declares (what the platform needs and can do, and how a panel draws it), connections, the one
Unicode-aware text helper a handler matches message text with, the `/command` parser, normalized
updates and activity, the managing and hook protocol trees with their AJV schemas, and the bot error
family. A shared package imports it to declare the bot routes; a server, a store, the panels and an
agent's tools build on it. It names no platform and stores, receives and sends nothing — the server
is `@owlmeans/server-bot`, each platform a plugin package of its own (`@owlmeans/bot-<platform>`).

## Installation

```bash
bun add @owlmeans/bot@^0.2.0-alpha.0
```

## Concepts

- **Connection** — one bot account on one platform, owned by a scope (an organization or the
  application). Clients see `BotConnection`, never a credential; `credentialsSet` names the keys set.
- **Update** — an inbound message normalized across platforms (`BotUpdate`). What to do with it is
  the application's handler's decision — it reads the application's own records (keyword groups)
  and compares the text with `botTextHelper.matched`.
- **Activity** — one thing the bot did or tried (`BotActivity`), recorded with `ok` / `error` and
  the handler's opaque `ref` (e.g. the id of the keyword group it followed).
- **Platform** — a string id (`BotPlatformId`, matching `BOT_PLATFORM_ID_PATTERN`) owned by the
  platform's plugin; the contract holds no list of platforms.
- **Descriptor** — `BotPlatformDescriptor`, declared by the plugin: credentials (with per-language
  labels and hints), receive modes, platform actions, setup, a neutral `glyph`, a per-language
  `hint` and an optional pre-save `link` (an invite). The server lists the registered plugins'
  descriptors on every managing tree (`platform.list`, `GET <base>/platforms`).

## Usage

```typescript
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { BotTextMatch, botCommandHelper, botTextHelper, makeBotHookProtocols, makeBotProtocols } from '@owlmeans/bot'

export const botProtocols = Object.freeze({
  operator: makeBotProtocols({ base: { alias: 'api:bot:operator', path: '/bot/operator' }, guards: DEFAULT_GUARD }),
  hook: makeBotHookProtocols({ base: { alias: 'api:bot:hook', path: '/bot/hook' } }),
})

const keywords = botTextHelper.phrasesOf('casino, free money')                 // ['casino', 'free money']
botTextHelper.matched('Free money at the CASINO!', keywords)                   // ['casino', 'free money']
botTextHelper.matched('megacasino.com', ['casino'], BotTextMatch.Contains)     // ['casino']
const command = botCommandHelper.parse('/report@MyBot spam', 'MyBot')         // { name: 'report', args: 'spam' }
```

## API

- Enums: `BotReceiveMode`, `BotTransport`, `BotConnectionStatus`, `BotActionKind`, `BotTextMatch`,
  `BotUpdateKind`, `BotChatKind`
- Types: `BotPlatformId`, `BotPlatformDescriptor`, `BotCredentialField`, `BotTexts`,
  `BotPlatformGlyph`, `BotPlatformLink`, `BotConnection`, `BotUpdate`, `BotActivity`, …
- Constants: `BOT_PLATFORM_ID_PATTERN`, `BOT_TEXT_FALLBACK_LANGUAGE`, `BOT_*` limits
  (`BOT_TEXT_MAX`, `BOT_LABEL_MAX`, `BOT_ACTIVITY_LIMIT_MAX`, `BOT_ID_PATTERN`, …),
  `BOT_MANAGE_PERMISSION`
- Helpers: `botTextHelper` (`fold`, `tokensOf`, `matched`, `phrasesOf`), `botCommandHelper`
  (`parse`), `botPlatformHelper` (`actionsOf(descriptor, credentialsSet)`, `supports`)
- Protocols: `makeBotProtocols` (connections, activity, `platform.list`), `makeBotHookProtocols` and
  their types (`BotProtocols`, `BotSurfaceProtocols` — `platform` optional, what servers and panels
  take —, `BotHookProtocols`, `BotProtocolOptions`, `BotHookProtocolOptions`, …)
- Schemas: `BotConnectionInputSchema`, `BotSimulateInputSchema`, `BotIdParamsSchema`,
  `BotActivityQuerySchema`, `BotHookParamsSchema`, `BotChallengeQuerySchema`
- Errors: `BotError`, `BotConnectionNotFound` (404), `BotCredentialsRejected` (422),
  `BotSignatureRejected` (401), `BotTransportMismatch` (409), `BotUnsupportedAction` (422),
  `BotErrorPlatform` (`bot:platform:<id>:<detail>` — the one wire class of every platform's API
  refusal; a plugin's own error classes extend it without a type name of their own)

## Common pitfalls

- Never put a guard in front of the hook tree: the platform signs the raw body.
- Ask `botPlatformHelper.supports(descriptor, …)` before an action — a platform supports only its
  descriptor's actions, and an optional credential may be what adds one.
- Never hard-code a platform list: read the registered descriptors (`platform.list`).
- Use `contains` for scripts written without spaces; `word` matches whole words and phrases.
- `simulate` (mock connections only) is an API route for tests and smoke runs — no UI offers it.

The `bot` skill covers text matching, the protocols and how a generated target mounts them.

## Related packages

- [`@owlmeans/entrypoint`](../entrypoint) — protocol declarations
- [`@owlmeans/planning`](../planning) — the same per-mount protocol-factory shape

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.0
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
