# @owlmeans/bot

The runtime-free, browser-safe contract of OwlMeans chat bots on Telegram, WhatsApp, Discord and
Slack: what each platform needs and can do, connections, keyword rules (groups) and the one
Unicode-aware matcher, the `/command` parser, normalized updates and activity, the managing and hook
protocol trees with their AJV schemas, and the bot error family. A shared package imports it to
declare the bot routes; a server, a store, the panels and an agent's tools build on it. It stores,
receives and sends nothing — that is `@owlmeans/server-bot`.

## Installation

```bash
bun add @owlmeans/bot@^0.1.18-rc.2
```

## Concepts

- **Connection** — one bot account on one platform, owned by a scope (an organization or the
  application). Clients see `BotConnection`, never a credential; `credentialsSet` names the keys set.
- **Rule** — a keyword group: keywords, a match mode (`word` / `contains`) and what to do
  (`BotRuleAction`). `connection: null` applies to every connection of the scope.
- **Update** — an inbound message normalized across platforms (`BotUpdate`), with the rules it
  matched already in `matches`.
- **Activity** — one thing the bot did or tried (`BotActivity`), recorded with `ok` / `error`.
- **Descriptor** — `BOT_PLATFORMS[platform]`: credentials, receive modes, platform actions, setup.

## Usage

```typescript
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { botCommandHelper, botRuleHelper, makeBotHookProtocols, makeBotProtocols } from '@owlmeans/bot'

export const botProtocols = Object.freeze({
  operator: makeBotProtocols({ base: { alias: 'api:bot:operator', path: '/bot/operator' }, guards: DEFAULT_GUARD }),
  hook: makeBotHookProtocols({ base: { alias: 'api:bot:hook', path: '/bot/hook' } }),
})

const matches = botRuleHelper.match('Free money at the CASINO!', rules)   // enabled rules, by order
const command = botCommandHelper.parse('/report@MyBot spam', 'MyBot')   // { name: 'report', args: 'spam' }
```

## API

- Enums: `BotPlatform`, `BotReceiveMode`, `BotTransport`, `BotConnectionStatus`, `BotActionKind`,
  `BotRuleAction`, `BotMatchMode`, `BotUpdateKind`, `BotChatKind`
- Constants: `BOT_PLATFORMS`, `BOT_*` limits (`BOT_KEYWORDS_MAX`, `BOT_KEYWORD_MAX`,
  `BOT_ACTIVITY_LIMIT_MAX`, `BOT_ID_PATTERN`, …)
- Helpers: `botRuleHelper` (`match`, `normalizeKeywords`, `appliesTo`), `botCommandHelper`
  (`parse`), `botPlatformHelper` (`actionsOf`, `supports`)
- Protocols: `makeBotProtocols`, `makeBotHookProtocols` and their types (`BotProtocols`,
  `BotHookProtocols`, `BotProtocolOptions`, `BotHookProtocolOptions`, …)
- Schemas: `BotConnectionInputSchema`, `BotRuleInputSchema`, `BotSimulateInputSchema`,
  `BotIdParamsSchema`, `BotRuleListQuerySchema`, `BotActivityQuerySchema`, `BotHookParamsSchema`,
  `BotChallengeQuerySchema`
- Errors: `BotError`, `BotConnectionNotFound` (404), `BotCredentialsRejected` (422),
  `BotSignatureRejected` (401), `BotTransportMismatch` (409), `BotUnsupportedAction` (422)

## Common pitfalls

- Never put a guard in front of the hook tree: the platform signs the raw body.
- Ask `botPlatformHelper.supports(...)` before an action — WhatsApp cannot delete, mute or ban;
  Slack deletes only with the admin `userToken`.
- Use `contains` for scripts written without spaces; `word` matches whole words and phrases.

The `bot` skill covers matching, the protocols and how a generated target mounts them.

## Related packages

- [`@owlmeans/entrypoint`](../entrypoint) — protocol declarations
- [`@owlmeans/planning`](../planning) — the same per-mount protocol-factory shape

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
