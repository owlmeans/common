import type { AgentPlugin } from '@owlmeans/agent'
import { BOT_AGENT_ORDER, BOT_AGENT_PLUGIN } from './consts.js'
import { botAgentHelper } from './helpers/agent.js'
import { botAgentTools } from './tools.js'
import type { BotAgentOptions } from './types.js'

/**
 * Lets an `@owlmeans/agent` agent act on ONE chat-bot update.
 *
 * `context` contributes the message — platform, chat, sender, the text quoted as data, the replied-to
 * text — the matched keyword groups with their instructions, and `instruction` when given; it lands
 * in the agent's project message (`PromptBlock.Context`), never in the cached system prompt.
 * `tools` are `botAgentTools(options)`: `reply`, `delete`, `warn`, `mute`, `ban`, `react` — only
 * those the platform supports and `allow` names — each acting on the update and never throwing.
 *
 * The alias is stable (`BOT_AGENT_PLUGIN`), so `agent.use(botAgentPlugin(…))` for the next update
 * replaces the previous one instead of adding a second message.
 */
export const botAgentPlugin = (options: BotAgentOptions): AgentPlugin => ({
  alias: BOT_AGENT_PLUGIN,
  order: BOT_AGENT_ORDER,
  context: async () => botAgentHelper.contextOf(options.update, options.instruction),
  tools: () => botAgentTools(options),
})
