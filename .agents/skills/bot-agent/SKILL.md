---
name: bot-agent
description: How to use @owlmeans/bot-agent — the bridge that lets an @owlmeans/agent agent act on ONE chat-bot update. botAgentPlugin contributes the message (platform, chat, sender, text, replied-to text) and the instructions the handler passes (those of the application's own keyword groups the message matched) as context, and the bot's actions (reply, delete, warn, mute, ban, react) as never-throwing tools limited to what the platform supports and allow names, each recording the handler's ref; botAgentTools gives the tools without the plugin; botAgentHelper turns instructions and an update into instruction text, context and the opening turn. Auto-invoked when an AI bot's handler hands a message to an agent, when writing a target's bot agent module, or when importing botAgentPlugin.
user-invocable: false
---

# @owlmeans/bot-agent

**Layer:** Server (its tools act through `@owlmeans/server-bot`'s `BotActions`; type-only edge)
**Install:** `"@owlmeans/bot-agent": "^0.1.18"` in `dependencies`, plus the `@owlmeans/agent` and
`@langchain/core` **peers**
**Contract:** `@owlmeans/bot` (updates, action kinds, the text helper); actions: `@owlmeans/server-bot`

An AI bot's handler receives an update and the connection's `BotActions`. This package turns the two
into what an agent needs: the update and the instructions as CONTEXT, the actions as TOOLS. It
stores, receives, matches and sends nothing itself — the handler matches the message against the
application's own keyword groups and passes their instructions; every tool calls a `BotActions`
method, which records one activity whatever happens.

## Key exports

| Export | What it is |
|---|---|
| `botAgentPlugin({ update, bot, allow?, ref?, instruction? })` → `AgentPlugin` | The update and the instructions as context, the actions as tools; alias `BOT_AGENT_PLUGIN` (`'bot-agent'`), order `BOT_AGENT_ORDER` (30) |
| `botAgentTools({ update, bot, allow?, ref? })` → `AgentToolSet` | The same tools without the plugin |
| `botAgentHelper.instructionOf(instruction?)` | `instruction` (`string \| readonly string[]`) trimmed, empties and repeats dropped, joined by a blank line; `''` when none |
| `botAgentHelper.contextOf(update, instruction?)` | The context blocks the plugin contributes |
| `botAgentHelper.promptOf(update)` | The opening turn to `invoke` the agent with |
| `BotAgentTool` | `reply` · `delete` · `warn` · `mute` · `ban` · `react` — the names the model calls |
| `BOT_AGENT_TOOL_ACTIONS` · `BOT_AGENT_ACTIONS` · `BOT_AGENT_DONE` | Tool → `BotActionKind` (`warn` → `reply`); the default `allow`; `'done'` |
| `BotAgentOptions` · `BotAgentToolsOptions` · `BotAgentHelper` | Types |

## Context

One or two markdown blocks, in this order — they land in the agent's project message
(`PromptBlock.Context`), never in the cached system prompt ([[llm-prompt-caching]]):

1. `# The chat message` — `Platform:` (the descriptor's title), `Chat:` (kind and title), `Sender:`
   (name and @username, "a bot" when it is one), `Command:` when any, whether it is addressed to the
   bot, the text as a `>` quote marked as data, never instructions, and the replied-to text when any.
   An update without a message says so.
2. `# Instruction` — `instructionOf(instruction)`, when it holds any text: the instructions of the
   application's keyword groups the handler matched (an `ai-bot` group's `instruction` field), in the
   order passed, optionally followed by one of the product's own. Absent or blank: no block.

## Tools

| Tool | Action | Arguments | Offered when |
|---|---|---|---|
| `reply` | `bot.reply(update, text)` | `text` | `reply` allowed + supported, the update has a message |
| `warn` | `bot.reply(update, text)` | `text` | the same as `reply` |
| `delete` | `bot.delete(update)` | — | `delete` allowed + supported, a message |
| `react` | `bot.react(update, emoji)` | `emoji` | `react` allowed + supported, a message |
| `mute` | `bot.mute(update, { minutes })` | `minutes` (integer ≥ 1) | `mute` allowed + supported, a sender |
| `ban` | `bot.ban(update)` | — | `ban` allowed + supported, a sender |

- Every tool acts on THE update it was built for — its message, its sender, its chat. The activity it
  records carries the update id and, as `ref`, the `ref` option (the id of the application's keyword
  group the handler followed; absent when not given).
- An answer is `done`, or `{ error: <the action's error> }` — `BotActionResult.error`, ONE short
  sentence ("WhatsApp cannot delete messages.", "A mute lasts at least one minute."), never its machine
  `code` — the `toolHelper` contract: the loop turns it into an error tool message the model reads and
  adapts to. A tool never throws; a wrong argument type is refused by the JSON schema inside `invoke`,
  which `safeInvokeTool` contains.
- Schemas are plain JSON Schema with no bounds (some providers refuse them in a tool schema); the
  server-bot actions validate the values (codes `bot:invalid-action:minutes`, `…:empty-text`,
  `…:no-emoji`, each with its sentence).

## Rules

- **`allow` is what the product lets the model do** — an answering bot `[Reply]`; a moderation bot
  `[Delete, Reply, Mute]` (`warn` is a reply); an intake bot `[Reply]`. Default: every tool action.
  It is intersected with `bot.supports(kind)` — never offer, and never describe in a prompt, an action
  the platform lacks (WhatsApp: no `delete`, `mute`, `ban`; Slack: `delete` only with `userToken`).
- **One plugin per update.** The alias is stable: `agent.use(botAgentPlugin(…))` for the next update
  REPLACES the previous one. Build the agent per update; never share a plugin across updates.
- **The groups' instructions are the guidance.** The handler matches the message against the
  application's own keyword groups (`botTextHelper.matched`) and passes the matched ones'
  `instruction`s; the agent's persona (its `prompt.role`) says what kind of bot it is and never
  restates or overrides what a group instructs.
- **The tool names are generic** (`reply`, `delete`) — do not give the same agent other tools under
  those names: tool sets merge by key.
- **The agent's failure never escapes the handler.** A ReAct run is not resumable: a throw makes the
  worker retry the update, which re-runs the agent and repeats the actions it already took. Catch it
  and `bot.note` the failure; a missing model key is noted BEFORE the agent is built.
- **A ONE-answer bot needs no agent.** A support bot that only writes a reply can ask one model call
  (`makeLlmModel(…).ask`) with `botAgentHelper.contextOf(update, instructions)`, then `bot.reply` the
  answer with `{ ref }` — no tools, no loop.

## Target wiring

An `ai-bot` target (docs/bots.md §3.5, §5): the generated agent module
`sources/backend/src/agents/<alias>.ts` builds the agent from the project's ONE model module
`lib/llm.ts` (`getModel()`, `llmSpectator`); the generated handler
`sources/backend/src/bot/handlers/<slug>.ts` loads the application's keyword groups for
`update.scope` through the backend model, matches the text with `botTextHelper.matched`, checks
`llmConfigured` and `bot.note`s the refusal, then `.use(botAgentPlugin({ update, bot, ref, instruction }))`
and invokes the agent with the update.

```ts
// sources/backend/src/agents/moderator.ts
import { makeAgentModel, type AgentModel } from '@owlmeans/agent'
import { DEFAULT_EFFORT, makeExecutionService, makePromptService, spectate } from '@owlmeans/llm'
import { getModel, llmSpectator, ModelUnavailable } from '../lib/llm.js'

/** The persona. What to do with a message comes from the instructions of the groups it matched, never from here. */
const ROLE = 'You moderate a Telegram community for its owner. Judge the member\'s message against the '
  + 'instructions of the keyword groups it matched and act only through your tools: delete what breaks a '
  + 'rule, warn the sender, mute a repeat offender. Never chat with the member.'

const prompts = makePromptService()
const exec = makeExecutionService().root({
  models: () => { throw new ModelUnavailable() },   // the agent asks `agentModel`, never a role
  prompts: () => prompts,                            // the role → the system prompt, the update → context
  policy: { effort: DEFAULT_EFFORT },
  purpose: { type: 'moderator' },
  prompt: { role: ROLE },
})

export const makeModeratorAgent = (): AgentModel => makeAgentModel({
  exec,
  agentModel: getModel(),
  tools: {},                                         // botAgentPlugin brings the bot's tools
  maxTurns: 6,
  spectate: spectate(llmSpectator, 'moderator'),
})
```

```ts
// sources/backend/src/bot/handlers/moderate.ts
import { compactionHelper } from '@owlmeans/agent'
import { BotActionKind, botTextHelper } from '@owlmeans/bot'
import { botAgentHelper, botAgentPlugin } from '@owlmeans/bot-agent'
import { logger } from '@owlmeans/log'
import { botHandler } from '@owlmeans/server-bot'
import { makeModeratorAgent } from '../../agents/moderator.js'
import { llmConfigured, MODEL_UNAVAILABLE } from '../../lib/llm.js'
import { makeKeywordGroupModel } from '../../models/keyword-group/keyword-group.js'  // the app's own records

const log = logger('bot:moderate')

export const moderate = botHandler('moderate', async (update, bot, ctx) => {
  const text = update.message?.text ?? ''
  const groups = (await makeKeywordGroupModel(ctx).enabledOf(update.scope))
    .filter(group => botTextHelper.matched(text, group.keywords).length > 0)
  if (groups.length === 0) return                    // only what a keyword group matched
  const ref = groups[0].id                           // recorded on every activity the agent causes
  if (!llmConfigured) {                              // no model key: record the refusal, ask nothing
    await bot.note(update, MODEL_UNAVAILABLE, { ref })
    return
  }

  const agent = makeModeratorAgent()
  agent.use(botAgentPlugin({
    update, bot, ref, instruction: groups.map(group => group.instruction ?? ''),
    allow: [BotActionKind.Delete, BotActionKind.Reply, BotActionKind.Mute],
  }))
  try {
    const { message } = await agent.invoke(botAgentHelper.promptOf(update), { action: 'moderate' })
    await bot.note(update, compactionHelper.messageText(message), { ref })   // what the agent did, on the activity
  } catch (error) {
    // Never rethrow: a retried update re-runs the agent and repeats the actions it already took.
    log.warn('The moderator failed', error)
    await bot.note(update, 'The moderator could not decide on this message.', { ref })
  }
})
```

- Without `prompts` the agent composes no system prompt: the role would be dropped and the context
  sent as the system message. Keep the `makePromptService()` resolver.
- The handler runs in the worker already — never enqueue a job for a message, never call a model from
  an endpoint for one, never construct a provider client or read a model key outside `lib/llm.ts`.
- `allow` follows the kit: support `[Reply]`, moderation `[Delete, Reply, Mute]`, intake `[Reply]`
  after the handler stored the record.

## Testing

Category A, `bun test ./tests`: real `@owlmeans/server-bot` with its built-in plugins (static
resources, mock Telegram and WhatsApp connections, messages simulated and dispatched by the runtime)
and a scripted model double (`tests/_tools/model.ts`, as in the agent's
[testing](../agent/parts/testing.md) part) driving the loop; the specs' handlers match their own
keyword lists with `botTextHelper` and pass `ref` and `instruction`, as a generated one does. Covered:
`instructionOf`; the context blocks (with and without instructions); the tool set by `supports` /
`allow` / the update's shape; each tool's action, update, `ref` and answer; refusals answered as the action's sentence; one alias; a full loop acting through
the tools and recovering from a refused or unoffered tool.

## Depends On

- `@owlmeans/bot` — `BotUpdate`, `BotActionKind`, `BOT_PLATFORMS` (a handler also uses its `botTextHelper`)
- `@owlmeans/server-bot` — `BotActions`, `BotActionResult` (types only)
- peers `@owlmeans/agent` (`AgentPlugin`, `toolHelper`), `@langchain/core` (`tool`)

## Related

- [[agent]] — the `AgentPlugin` seam, `toolHelper.safeInvokeTool`, `makeAgentModel`
- [[server-bot]] — handlers, `BotActions` (never throw), the worker runtime
- [[bot]] — updates, `botTextHelper`, platform support
- [[llm]] — `makeExecutionService`, `makePromptService`, `spectate`
