import { BaseMessage } from '@langchain/core/messages'
import type { MessageFieldWithRole } from '@langchain/core/messages'
import { EMPTY_CONTENT_STUB, JSON_INSTRUCTION, NO_THINK_DIRECTIVE } from '../consts.js'

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

const isBlankTextBlock = (part: unknown): boolean =>
  typeof part === 'object' && part !== null
  && (part as Record<string, unknown>).type === 'text'
  && typeof (part as Record<string, unknown>).text === 'string'
  && (part as Record<string, string>).text.trim() === ''

/**
 * Remove whitespace-only text content so no request carries a blank text block.
 *
 * Anthropic rejects one outright (`400 messages: text content blocks must contain
 * non-whitespace text`), and a 400 is fatal — a single blank block, typically a file
 * read that returned nothing, kills the whole call with no retry. Blank text blocks
 * are dropped from block arrays; a message left without content is removed, with two
 * exceptions: a tool result keeps its `tool_use` pairing by carrying a stub instead,
 * and an AI message that still holds tool calls keeps an empty string, which
 * serializes without a text block. An input that loses every message gets one stub
 * user message so the request stays valid.
 */
export const dropBlankContent = (msgs: MessageFieldWithRole[]): void => {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i]
    let content = msg.content
    if (Array.isArray(content)) {
      const kept = content.filter(part => !isBlankTextBlock(part))
      if (kept.length !== content.length) {
        msg.content = kept as unknown as typeof msg.content
      }
      if (kept.length > 0) {
        continue
      }
      content = ''
    }
    if (typeof content === 'string' && content.trim() === '') {
      const role = msg instanceof BaseMessage ? msg.getType() : `${msg.role}`
      const toolCalls = (msg as { tool_calls?: unknown[] }).tool_calls
      if (role === 'tool') {
        msg.content = EMPTY_CONTENT_STUB
      } else if (toolCalls != null && toolCalls.length > 0) {
        msg.content = ''
      } else {
        msgs.splice(i, 1)
      }
    }
  }
  if (msgs.length === 0) {
    msgs.push({ role: 'user', content: EMPTY_CONTENT_STUB })
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
