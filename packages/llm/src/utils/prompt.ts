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
 * Drop every `cache_control` marker from the messages.
 *
 * Markers are placed in-place, on the caller's own message objects — and a caller that
 * carries its message array across calls (the coder's growing conversation, a fix loop
 * re-sending the same sources) hands them back still marked. The provider counts markers
 * per REQUEST, not per message: Anthropic rejects the fifth outright with
 * `400 A maximum of 4 blocks with cache_control may be provided. Found 5.`, and since a
 * 400 is fatal it burns the entire retry budget before surfacing.
 *
 * So the pipeline always starts from a clean slate and re-places its own markers, which
 * makes the per-request count a function of THIS call alone.
 */
export const stripCacheMarkers = (msgs: MessageFieldWithRole[]): void => {
  for (const msg of msgs) {
    if (!Array.isArray(msg.content)) {
      continue
    }
    let found = false
    const blocks = msg.content.map(part => {
      if (typeof part === 'object' && part !== null && 'cache_control' in part) {
        found = true
        const { cache_control: _dropped, ...rest } = part as Record<string, unknown>
        return rest
      }
      return part
    })
    if (found) {
      msg.content = blocks as unknown as typeof msg.content
    }
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
