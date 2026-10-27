import { BotAgentTool } from './consts.js'

/** Tools that act on the update's MESSAGE — offered only when the update carries one. */
export const BOT_AGENT_MESSAGE_TOOLS: ReadonlySet<BotAgentTool> = new Set([
  BotAgentTool.Reply, BotAgentTool.Delete, BotAgentTool.Warn, BotAgentTool.React,
])

/** Tools that act on the update's SENDER — offered only when the update has one. */
export const BOT_AGENT_MEMBER_TOOLS: ReadonlySet<BotAgentTool> = new Set([BotAgentTool.Mute, BotAgentTool.Ban])
