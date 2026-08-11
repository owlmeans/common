import { AIMessage, BaseMessage } from '@langchain/core/messages'
import type { UsageMetadata } from '@langchain/core/messages'
import { SpectatorContentType } from '@owlmeans/llm-common'
import type { SpectatorEntryMessage } from '@owlmeans/llm-common'
import type { LlmSpectator, ModelInputItem } from '../types.js'
import { hasCacheActivity, readCacheUsage } from './cache.js'

/** Normalize one prompt message into the spectator's storage shape. */
const describeInput = (msg: ModelInputItem, callType: string): SpectatorEntryMessage => {
  const entry: SpectatorEntryMessage = {
    callType,
    type: 'unknown',
    content: '',
    contentType: SpectatorContentType.Text,
  }

  if (msg instanceof BaseMessage) {
    entry.type = msg.type
    entry.content = msg.content as unknown as string
    entry.name = msg.name
    entry.contentType = typeof msg.content === 'string' ? SpectatorContentType.Text : SpectatorContentType.Json
    entry.usage = 'usage_metadata' in msg ? msg.usage_metadata as UsageMetadata : undefined
    entry.raw = JSON.stringify({ message: msg, content: msg.content, meta: msg.response_metadata })
  } else if (typeof msg === 'object' && 'content' in msg) {
    entry.type = msg.role as string ?? 'unknown'
    entry.content = msg.content as string ?? msg as unknown as string
    entry.raw = JSON.stringify(msg)
  } else {
    entry.content = msg as unknown as string
    entry.raw = JSON.stringify(msg)
  }

  return entry
}

/**
 * Log a completed model call: every prompt message plus the completion, as one entry.
 * A tool-calling completion carries its arguments rather than its (empty) content.
 */
export const spectate = (spectator: LlmSpectator, callType: string) =>
  async (
    input: ModelInputItem[],
    message: AIMessage,
    action: string,
    retries: number,
    startedAt?: number,
  ) => {
    const messages = input.map(msg => describeInput(msg, callType))

    const completion: SpectatorEntryMessage = {
      type: message.type,
      callType,
      content: '',
      name: message.name,
      contentType: typeof message.content === 'string' ? SpectatorContentType.Text : SpectatorContentType.Json,
      usage: message.usage_metadata,
      raw: JSON.stringify({ message, content: message.content, meta: message.response_metadata }),
    }

    if (message.tool_calls != null && message.tool_calls.length > 0) {
      completion.content = message.tool_calls as unknown as string
      completion.contentType = SpectatorContentType.ToolCall
    } else {
      completion.content = message.content as unknown as string
    }

    // Silent unless the provider reported cache activity, so it costs nothing when
    // caching is off — and is the one signal that tells a stable prefix from a broken one.
    const cache = readCacheUsage(message)
    if (hasCacheActivity(cache)) {
      console.log(
        `Prompt cache [${action}]: read ${cache.read}, written ${cache.creation}, uncached ${cache.input}`
      )
    }

    return spectator.log({ action, retries, startedAt, messages: [...messages, completion] })
  }
