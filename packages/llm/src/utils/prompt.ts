import type { MessageFieldWithRole } from '@langchain/core/messages'
import { JSON_INSTRUCTION, NO_THINK_DIRECTIVE } from '../consts.js'

const messageMentions = (msg: MessageFieldWithRole, needle: string): boolean => {
  if (typeof msg.content === 'string') return msg.content.toLowerCase().includes(needle)
  if (Array.isArray(msg.content)) {
    return msg.content.some(
      (part: unknown) => typeof part === 'object' && part !== null && 'text' in (part as Record<string, unknown>)
        && typeof (part as Record<string, string>).text === 'string'
        && (part as Record<string, string>).text.toLowerCase().includes(needle)
    )
  }
  return false
}

/** Append `text` to the last message, or push it as a new user message when that is not possible. */
const appendDirective = (msgs: MessageFieldWithRole[], text: string): void => {
  const last = msgs[msgs.length - 1]
  if (last != null && typeof last.content === 'string') {
    last.content = `${last.content}\n${text}`
  } else {
    msgs.push({ role: 'user', content: text })
  }
}

/**
 * Ensure the word "json" appears somewhere in the prompt. Several providers refuse or
 * silently ignore a JSON mode unless it does; when it is missing the JSON instruction is
 * appended in place.
 */
export const ensureJsonMention = (msgs: MessageFieldWithRole[]): void => {
  if (msgs.some(msg => messageMentions(msg, 'json'))) return
  appendDirective(msgs, JSON_INSTRUCTION)
}

/**
 * Append the `/no_think` soft switch when the config asks for it. Without it,
 * thinking-mode models frequently spend their entire output budget on hidden reasoning
 * and return empty content with `finish_reason="length"`, which then fails every filter
 * and exhausts the retries.
 */
export const applyNoThink = (msgs: MessageFieldWithRole[], disableThinking: boolean | undefined): void => {
  if (disableThinking !== true) return
  if (msgs.some(msg => typeof msg.content === 'string' && msg.content.includes(NO_THINK_DIRECTIVE))) return
  appendDirective(msgs, NO_THINK_DIRECTIVE)
}
