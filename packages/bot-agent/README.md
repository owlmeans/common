# @owlmeans/bot-agent

The bridge between an OwlMeans chat bot and an `@owlmeans/agent` agent. `botAgentPlugin` hands the
agent ONE bot update: the message — platform, chat, sender, the text, the replied-to text — and the
keyword groups it matched, with their instructions, become the agent's context; the bot's actions
(`reply`, `delete`, `warn`, `mute`, `ban`, `react`) become its tools, limited to what the platform
supports and the caller allows. A tool never throws: it answers `done`, or what went wrong.

It stores, receives and sends nothing itself — the actions are `@owlmeans/server-bot`'s
`BotActions`, which record every call as activity.

## Installation

```bash
bun add @owlmeans/bot-agent@^0.1.18-rc.2
```

`@owlmeans/agent` and `@langchain/core` are peers.

## Usage

```typescript
import { BotActionKind } from '@owlmeans/bot'
import { botAgentHelper, botAgentPlugin } from '@owlmeans/bot-agent'
import { botHandler } from '@owlmeans/server-bot'

export const moderate = botHandler('moderate', async (update, bot) => {
  if (update.matches.length === 0) return
  const agent = makeModeratorAgent()                    // your makeAgentModel(…) factory
  agent.use(botAgentPlugin({ update, bot, allow: [BotActionKind.Delete, BotActionKind.Reply] }))
  await agent.invoke(botAgentHelper.promptOf(update), { action: 'moderate' })
})
```

## Exports

| Export | What it is |
|---|---|
| `botAgentPlugin({ update, bot, allow?, instruction? })` | The `AgentPlugin`: the update as context, the actions as tools; alias `BOT_AGENT_PLUGIN` |
| `botAgentTools({ update, bot, allow? })` | The same tools without the plugin, as an `AgentToolSet` |
| `botAgentHelper` | `instructionOf(update, extra?)`, `contextOf(update, instruction?)`, `promptOf(update)` |
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
npx @owlmeans/agent-skills@^0.1.18-rc.59
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
