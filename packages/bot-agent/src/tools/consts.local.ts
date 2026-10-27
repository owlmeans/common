import { BotAgentTool } from '../consts.js'

/** What the model reads about each tool. The result line is part of the contract: `done`, or the error. */
export const BOT_AGENT_TOOL_DESCRIPTIONS: Readonly<Record<BotAgentTool, string>> = Object.freeze({
  [BotAgentTool.Reply]: 'Reply to the member\'s message, in its chat and thread. Answers "done", or what went wrong.',
  [BotAgentTool.Delete]: 'Delete the member\'s message from the chat. Answers "done", or what went wrong.',
  [BotAgentTool.Warn]: 'Warn the sender: a reply to their message saying which rule it broke. Answers "done", '
    + 'or what went wrong.',
  [BotAgentTool.Mute]: 'Mute the sender in this chat for a number of minutes — they can read but not write. '
    + 'Answers "done", or what went wrong.',
  [BotAgentTool.Ban]: 'Ban the sender from this chat. Answers "done", or what went wrong.',
  [BotAgentTool.React]: 'React to the member\'s message with one emoji. Answers "done", or what went wrong.',
})

/** What a tool answers when a failed action gave no sentence (a `BotActions` of another make). */
export const BOT_AGENT_NO_REASON = 'The platform did not say why.'
