import { BotActionKind } from '@owlmeans/bot'

/** The plugin's alias. Stable: registering the plugin again on an agent REPLACES the earlier one. */
export const BOT_AGENT_PLUGIN = 'bot-agent'

/** Where the plugin sits in an agent's chain — the message comes before memory (40–45) and the default (50). */
export const BOT_AGENT_ORDER = 30

/** What a tool answers when its action succeeded. */
export const BOT_AGENT_DONE = 'done'

/** The bot's tools, by the name the model calls them. */
export enum BotAgentTool {
  /** Answer the member's message in its chat and thread. */
  Reply = 'reply',
  /** Delete the member's message. */
  Delete = 'delete',
  /** A reply that warns the sender — the same platform call as `reply`. */
  Warn = 'warn',
  /** Mute the sender in the chat for some minutes. */
  Mute = 'mute',
  /** Ban the sender from the chat. */
  Ban = 'ban',
  /** React to the member's message with one emoji. */
  React = 'react',
}

/** The platform action each tool performs: `warn` is a `reply`. */
export const BOT_AGENT_TOOL_ACTIONS: Readonly<Record<BotAgentTool, BotActionKind>> = Object.freeze({
  [BotAgentTool.Reply]: BotActionKind.Reply,
  [BotAgentTool.Delete]: BotActionKind.Delete,
  [BotAgentTool.Warn]: BotActionKind.Reply,
  [BotAgentTool.Mute]: BotActionKind.Mute,
  [BotAgentTool.Ban]: BotActionKind.Ban,
  [BotAgentTool.React]: BotActionKind.React,
})

/** Every action a tool can perform — what `allow` means when it is omitted. */
export const BOT_AGENT_ACTIONS: readonly BotActionKind[] = Object.freeze([
  BotActionKind.Reply, BotActionKind.Delete, BotActionKind.Mute, BotActionKind.Ban, BotActionKind.React,
])
