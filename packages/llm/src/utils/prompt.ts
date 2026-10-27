import { BaseMessage, type MessageFieldWithRole } from '@langchain/core/messages'
import { EMPTY_CONTENT_STUB, JSON_INSTRUCTION, NO_THINK_DIRECTIVE } from '../consts.js'
import { CHUNK_SEPARATOR } from '../prompt/consts.js'
import { toolCallInstruction } from '../utils.js'
import { messageUtils } from './messages.js'
import { CACHE_MARKER_KEYS, TAIL_TAKERS } from './prompt/consts.js'
import type { PromptUtils } from './prompt/types.js'

export const createPromptUtils = (): PromptUtils => {
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

  /** The block without any cache marker, or the block itself when it carries none. */
  const unmarked = (part: unknown): unknown => {
    if (typeof part !== 'object' || part === null) {
      return part
    }
    const record = part as Record<string, unknown>
    const extras = record.extras as Record<string, unknown> | undefined
    const inExtras = typeof extras === 'object' && extras !== null && 'prompt_cache_breakpoint' in extras
    if (!inExtras && !CACHE_MARKER_KEYS.some(key => key in record)) {
      return part
    }
    const rest = Object.fromEntries(Object.entries(record).filter(([key]) => !CACHE_MARKER_KEYS.includes(key)))
    if (inExtras) {
      const { prompt_cache_breakpoint: _dropped, ...kept } = extras
      if (Object.keys(kept).length > 0) {
        rest.extras = kept
      } else {
        delete rest.extras
      }
    }

    return rest
  }

  const stripCacheMarkers = (msgs: MessageFieldWithRole[]): void => {
    for (const msg of msgs) {
      if (!Array.isArray(msg.content)) {
        continue
      }
      const blocks = msg.content.map(unmarked)
      if (blocks.some((block, i) => block !== (msg.content as unknown[])[i])) {
        msg.content = blocks as unknown as typeof msg.content
      }
    }
  }

  const appendTail = (msgs: MessageFieldWithRole[], tail: string): void => {
    const text = tail.trim()
    if (text === '') {
      return
    }
    const last = msgs[msgs.length - 1]
    if (last == null || !TAIL_TAKERS.includes(messageUtils.roleOf(last))) {
      msgs.push({ role: 'user', content: text })
    } else if (typeof last.content === 'string') {
      last.content = `${last.content}${CHUNK_SEPARATOR}${text}`
    } else if (Array.isArray(last.content)) {
      last.content = [...last.content, { type: 'text', text }] as unknown as typeof last.content
    } else {
      msgs.push({ role: 'user', content: text })
    }
  }

  const isBlankTextBlock = (part: unknown): boolean =>
    typeof part === 'object' && part !== null
    && (part as Record<string, unknown>).type === 'text'
    && typeof (part as Record<string, unknown>).text === 'string'
    && (part as Record<string, string>).text.trim() === ''

  const dropBlankContent = (msgs: MessageFieldWithRole[]): void => {
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

  const ensureJsonMention = (msgs: MessageFieldWithRole[]): void => {
    if (msgs.some(msg => messageMentions(msg, 'json'))) return
    appendDirective(msgs, JSON_INSTRUCTION)
  }

  const applyNoThink = (msgs: MessageFieldWithRole[], disableThinking: boolean | undefined): void => {
    if (disableThinking !== true) return
    if (msgs.some(msg => typeof msg.content === 'string' && msg.content.includes(NO_THINK_DIRECTIVE))) return
    appendDirective(msgs, NO_THINK_DIRECTIVE)
  }

  const ensureToolCall = (msgs: MessageFieldWithRole[], toolName: string): void => {
    const instruction = toolCallInstruction(toolName)
    if (msgs.some(msg => typeof msg.content === 'string' && msg.content.includes(instruction))) return
    appendDirective(msgs, instruction)
  }

  return { stripCacheMarkers, dropBlankContent, ensureJsonMention, applyNoThink, ensureToolCall, appendTail }
}

export const promptUtils = createPromptUtils()
