import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import type { JSONSchema } from '@langchain/core/utils/json_schema'
import { toolHelper, type AgentToolSet, type ToolErrorResponse } from '@owlmeans/agent'
import type { BotActionKind } from '@owlmeans/bot'
import type { BotActionOptions, BotActionResult } from '@owlmeans/server-bot'
import { BOT_AGENT_ACTIONS, BOT_AGENT_DONE, BOT_AGENT_TOOL_ACTIONS, BotAgentTool } from './consts.js'
import { BOT_AGENT_MEMBER_TOOLS, BOT_AGENT_MESSAGE_TOOLS } from './consts.local.js'
import type { BotAgentToolsOptions } from './types.js'
import { BOT_AGENT_NO_REASON, BOT_AGENT_TOOL_DESCRIPTIONS } from './tools/consts.local.js'
import {
  BotAgentMuteSchema, BotAgentNoArgsSchema, BotAgentReactSchema, BotAgentTextSchema, BotAgentWarnSchema,
} from './tools/schemas.js'
import type { BotAgentToolArgs } from './tools/types.local.js'

/**
 * The bot's actions as agent tools, bound to ONE update — without the plugin, for a caller that
 * assembles an agent's tools itself.
 *
 * A tool is offered only when its action is in `allow` (default: all), `bot.supports` it, and the
 * update has what it acts on (a message for `reply` / `warn` / `delete` / `react`, a sender for
 * `mute` / `ban`). Every tool NEVER throws: it answers `done`, or `{ error }` with the action's
 * one-sentence `error` — the `toolHelper` contract, so a refused action is something the model reads
 * and adapts to. The activity each action records names the first matched group as its rule.
 */
export const botAgentTools = (options: BotAgentToolsOptions): AgentToolSet => {
  const { update, bot } = options
  const allowed = new Set<BotActionKind>(options.allow ?? BOT_AGENT_ACTIONS)
  const rule = update.matches?.[0]?.rule.id
  const opts: BotActionOptions = rule != null ? { rule } : {}

  const supported = (kind: BotActionKind): boolean => {
    try {
      return bot.supports(kind)
    } catch {
      return false
    }
  }

  const offered = (name: BotAgentTool): boolean => {
    const kind = BOT_AGENT_TOOL_ACTIONS[name]
    if (!allowed.has(kind) || !supported(kind)) {
      return false
    }

    return BOT_AGENT_MESSAGE_TOOLS.has(name) ? update.message != null
      : BOT_AGENT_MEMBER_TOOLS.has(name) ? update.sender != null
        : true
  }

  const textOf = (value: unknown): string => typeof value === 'string' ? value : ''

  const define = (
    name: BotAgentTool, schema: JSONSchema, perform: (args: BotAgentToolArgs) => Promise<BotActionResult>,
  ): StructuredToolInterface => tool(
    async (input: unknown): Promise<string | ToolErrorResponse> => {
      try {
        const args: BotAgentToolArgs = input != null && typeof input === 'object' ? input : {}
        const result = await perform(args)
        // The action's own sentence ("WhatsApp cannot delete messages."), never its machine `code`.
        return result?.ok === true
          ? BOT_AGENT_DONE
          : { error: result?.error ?? BOT_AGENT_NO_REASON }
      } catch (e) {
        // BotActions never throw by contract; a broken one still must not take the run with it.
        return toolHelper.toErrorResponse(e)
      }
    },
    { name, description: BOT_AGENT_TOOL_DESCRIPTIONS[name], schema },
  ) as unknown as StructuredToolInterface

  const definitions: Record<BotAgentTool, () => StructuredToolInterface> = {
    [BotAgentTool.Reply]: () => define(BotAgentTool.Reply, BotAgentTextSchema,
      async ({ text }) => await bot.reply(update, textOf(text), opts)),
    [BotAgentTool.Delete]: () => define(BotAgentTool.Delete, BotAgentNoArgsSchema,
      async () => await bot.delete(update, opts)),
    [BotAgentTool.Warn]: () => define(BotAgentTool.Warn, BotAgentWarnSchema,
      async ({ text }) => await bot.reply(update, textOf(text), opts)),
    [BotAgentTool.Mute]: () => define(BotAgentTool.Mute, BotAgentMuteSchema,
      async ({ minutes }) => await bot.mute(update, { ...opts, minutes: Math.round(Number(minutes)) })),
    [BotAgentTool.Ban]: () => define(BotAgentTool.Ban, BotAgentNoArgsSchema,
      async () => await bot.ban(update, opts)),
    [BotAgentTool.React]: () => define(BotAgentTool.React, BotAgentReactSchema,
      async ({ emoji }) => await bot.react(update, textOf(emoji), opts)),
  }

  const tools: AgentToolSet = {}
  for (const name of Object.values(BotAgentTool)) {
    if (offered(name)) {
      tools[name] = definitions[name]()
    }
  }

  return tools
}
