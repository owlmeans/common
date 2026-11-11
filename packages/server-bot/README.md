# @owlmeans/server-bot

The server runtime of OwlMeans chat bots: connections with sealed credentials, the signed inbound
hook and its inbox, the worker's dispatcher and receivers (handing every update to the
application's handlers), never-throwing bot actions recorded as activity, the platform plugin
interface and its registry, an API-faithful mock transport and a configurable test platform. It
names no platform: each one is a plugin package of its own (`@owlmeans/bot-<platform>`, published
from the OwlMeans connect repository), registered explicitly — the service supports exactly the
platforms it is given. It works over any `@owlmeans/resource` store — `@owlmeans/bot-postgres`
provides the Postgres one.

## Installation

```bash
bun add @owlmeans/server-bot@^0.2.0-alpha.0
```

## Usage

```typescript
import { botTextHelper } from '@owlmeans/bot'
import { appendBot, botHandler, serveBotEntrypoints, serveBotHookEntrypoints } from '@owlmeans/server-bot'

// backend context — after the three resources are registered (bot-connection, bot-update, bot-activity);
// `platforms` are the plugin instances of the platforms this product supports
appendBot(context, { platforms: [chatPlatform] })

// API process
context.registerEntrypoints([
  ...serveBotEntrypoints(botProtocols.operator, { scope: async (req, ctx) => organizationOf(req) }),
  ...serveBotHookEntrypoints(botProtocols.hook),
])

// worker process — the handler matches the application's own keyword groups
const moderate = botHandler('moderate', async (update, bot, ctx) => {
  for (const group of await keywordGroupsOf(ctx, update.scope)) {
    if (botTextHelper.matched(update.message?.text ?? '', group.keywords).length > 0) {
      await bot.delete(update, { ref: group.id })   // the ref is recorded on the activity
    }
  }
})
await context.service<BotService>(BOT_SERVICE).runtime([moderate]).start()
```

## API

- Service: `appendBot`, `makeBotService` (`platforms` — the registered plugins), `BotService`
  (`connections`, `activity`, `platforms()`, `register(plugin)`, `receive`, `simulate`, `runtime`,
  `actions`), `botHandler`, `BotActions` (`supports`, `descriptor()`, the actions),
  `BotActionOptions` (`ref`), `BotActionResult`
- Serving: `serveBotEntrypoints` (binds `platform.list` when the tree carries it),
  `serveBotHookEntrypoints`
- Records: `BotConnectionRecord`, `BotUpdateRecord`, `BotActivityRecord` and their
  `Bot*RecordSchema`; aliases `RES_BOT_CONNECTION` … ; `BotInboxStatus`
- Platforms (what a plugin package builds on): `BotPlatformPlugin` and its session / action /
  mock types, `makeBotPlatformRegistry`, `botHookHelper` (headers, raw body, timing-safe secret),
  `botSignalHelper` (call deadline, rate-limit wait)
- Helpers: `botCryptoHelper` (AES-256-GCM sealing), `botOriginHelper`
- `@owlmeans/server-bot/mock`: `makeBotMockHelper(plugins).inbound(platform, input, signing)` —
  native payloads, signed where the platform signs; `makeTestBotPlatform(options)` — a complete
  plugin over an invented chat API (auto webhook with poll fallback, poll, gateway, manual setup with
  a generated credential, an optional credential enabling an action, server-only actions)
- `@owlmeans/server-bot/conformance`: the runner-agnostic store suite (on the test platform unless
  another plugin is named)

## Common pitfalls

- Register the platform plugins explicitly — with none, the service warns where it boots and refuses
  every save; a platform without a plugin answers `unsupported-action`.
- `APP_SECRET` (or the `secret` option) must be set to save credentials — they are never stored in clear.
- Run `runtime(handlers)` in the worker only; the API process only stores inbound updates.
- Actions never throw — check `ok`; `error` is a sentence to show or hand to a model, `code` the
  marker to compare.
- A receiver whose token is revoked (or whose platform refuses its configuration) fails its
  connection; verify it again after fixing the cause.
- `simulate` and mock connections are for tests and the runtime smoke, called through the API — no
  panel offers them.

The `server-bot` skill covers the plugin interface, the inbox and runtime semantics and target wiring.

## Related packages

- [`@owlmeans/bot`](../bot) — the contract: platform descriptors, connections, the text helper, protocols, errors
- [`@owlmeans/server-planning`](../server-planning) — the same serve-a-protocol-tree shape

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
