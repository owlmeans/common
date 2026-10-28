# @owlmeans/bot-agent

The bridge between an OwlMeans chat bot and an `@owlmeans/agent` agent. `botAgentPlugin` hands the
agent ONE bot update: the message — platform, chat, sender, the text, the replied-to text — and the
instructions the handler passes (those of the application's own keyword groups the message matched)
become the agent's context; the bot's actions (`reply`, `delete`, `warn`, `mute`, `ban`, `react`)
become its tools, limited to what the platform supports and the caller allows, each recording the
handler's `ref`. A tool never throws: it answers `done`, or what went wrong.

It stores, receives, matches and sends nothing itself — the handler matches the message against the
application's records, and the actions are `@owlmeans/server-bot`'s `BotActions`, which record every
call as activity.

## Installation

```bash
bun add @owlmeans/bot-agent@^0.1.18
```

`@owlmeans/agent` and `@langchain/core` are peers.

## Usage

```typescript
import { BotActionKind, botTextHelper } from '@owlmeans/bot'
import { botAgentHelper, botAgentPlugin } from '@owlmeans/bot-agent'
import { botHandler } from '@owlmeans/server-bot'

export const moderate = botHandler('moderate', async (update, bot, ctx) => {
  const text = update.message?.text ?? ''
  const groups = (await keywordGroupsOf(ctx, update.scope))     // the application's own records
    .filter(group => botTextHelper.matched(text, group.keywords).length > 0)
  if (groups.length === 0) return
  const agent = makeModeratorAgent()                            // your makeAgentModel(…) factory
  agent.use(botAgentPlugin({
    update, bot, ref: groups[0].id, instruction: groups.map(group => group.instruction ?? ''),
    allow: [BotActionKind.Delete, BotActionKind.Reply],
  }))
  await agent.invoke(botAgentHelper.promptOf(update), { action: 'moderate' })
})
```

## Exports

| Export | What it is |
|---|---|
| `botAgentPlugin({ update, bot, allow?, ref?, instruction? })` | The `AgentPlugin`: the update and the instructions (`string \| string[]`) as context, the actions as tools; alias `BOT_AGENT_PLUGIN` |
| `botAgentTools({ update, bot, allow?, ref? })` | The same tools without the plugin, as an `AgentToolSet` |
| `botAgentHelper` | `instructionOf(instruction?)`, `contextOf(update, instruction?)`, `promptOf(update)` |
| `BotAgentTool`, `BOT_AGENT_TOOL_ACTIONS`, `BOT_AGENT_ACTIONS`, `BOT_AGENT_DONE`, `BOT_AGENT_ORDER` | Tool names, the action each performs, the default `allow`, the success answer, the plugin order |
| `BotAgentOptions`, `BotAgentToolsOptions`, `BotAgentHelper` | Types |

## Testing

`bun test ./tests` — no provider: real `@owlmeans/server-bot` actions on mock connections over
static resources, and a scripted model double driving the agent loop.

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
