# @owlmeans/server-bot

The server runtime of OwlMeans chat bots on Telegram, WhatsApp, Discord and Slack: connections with
sealed credentials, the signed inbound hook and its inbox, the worker's dispatcher and receivers
(handing every update to the application's handlers), never-throwing bot actions recorded as activity, the platform plugin interface with all
four platform plugins, and an API-faithful mock transport. It works over any `@owlmeans/resource` store —
`@owlmeans/bot-postgres` provides the Postgres one.

## Installation

```bash
bun add @owlmeans/server-bot@^0.1.18
```

## Usage

```typescript
import { botTextHelper } from '@owlmeans/bot'
import { appendBot, botHandler, serveBotEntrypoints, serveBotHookEntrypoints } from '@owlmeans/server-bot'

// backend context — after the three resources are registered (bot-connection, bot-update, bot-activity)
appendBot(context)

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

- Service: `appendBot`, `makeBotService`, `BotService` (`connections`, `activity`, `receive`,
  `simulate`, `runtime`, `actions`), `botHandler`, `BotActions`, `BotActionOptions` (`ref`),
  `BotActionResult`
- Serving: `serveBotEntrypoints`, `serveBotHookEntrypoints`
- Records: `BotConnectionRecord`, `BotUpdateRecord`, `BotActivityRecord` and their
  `Bot*RecordSchema`; aliases `RES_BOT_CONNECTION` … ; `BotInboxStatus`
- Platforms: `BotPlatformPlugin`, `makeBotPlatformRegistry`, `BOT_BUILTIN_PLATFORMS`, `botHookHelper`,
  `telegramBotPlatform`, `whatsappBotPlatform`, `discordBotPlatform`, `slackBotPlatform` (and their
  `make*BotPlatform(options)` factories and API error classes)
- Helpers: `botCryptoHelper` (AES-256-GCM sealing), `botOriginHelper`
- `@owlmeans/server-bot/mock`: `botMockHelper.inbound(platform, input, signing)` — native payloads,
  signed where the platform signs
- `@owlmeans/server-bot/conformance`: the runner-agnostic store suite

## Common pitfalls

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

- [`@owlmeans/bot`](../bot) — the contract: platforms, connections, the text helper, protocols, errors
- [`@owlmeans/server-planning`](../server-planning) — the same serve-a-protocol-tree shape

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
