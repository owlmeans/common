import { AIMessage, type AIMessageChunk, type InvalidToolCall, type ToolCall, type ToolCallChunk } from '@langchain/core/messages'
import type { LlmPlugin } from '../plugins/types.js'
import { jsonHelper } from './json.js'
import type { ToolCallsHelper } from './tool-calls/types.js'
import type { ChunkGroup, RebuiltCalls } from './tool-calls/types.local.js'

export const createToolCallsHelper = (): ToolCallsHelper => {
  const named = (id: string | undefined): id is string => id != null && id !== ''

  /**
   * The chunks regrouped: a chunk with an id joins that call; an id-less fragment joins the call of
   * its position, else the call streamed last — a provider streams one call's fragments after its
   * header, and langchain keeps the fragments it could not place in arrival order.
   */
  const groupsOf = (chunks: readonly ToolCallChunk[]): ChunkGroup[] => {
    const groups: ChunkGroup[] = []
    for (const chunk of chunks) {
      const id = named(chunk.id) ? chunk.id : undefined
      let group = id != null
        ? groups.find(each => each.id === id)
        : (chunk.index != null ? groups.find(each => each.index === chunk.index) : undefined) ?? groups.at(-1)
      if (group == null) {
        group = { ...(id != null ? { id } : {}), ...(chunk.index != null ? { index: chunk.index } : {}), args: [] }
        groups.push(group)
      }
      if (group.name == null && chunk.name != null && chunk.name !== '') group.name = chunk.name
      if (chunk.args != null && chunk.args !== '') group.args.push(chunk.args)
    }

    return groups
  }

  /** Streamed calls the rebuilt ones do not name are kept after them — a call is never dropped. */
  const withStreamed = (calls: ToolCall[], streamed: readonly ToolCall[]): ToolCall[] => {
    const ids = new Set(calls.map(call => call.id))

    return [...calls, ...streamed.filter(call => !named(call.id) || !ids.has(call.id))]
  }

  const fromRecord = (record: ToolCall[], message: AIMessage | AIMessageChunk): RebuiltCalls => {
    const calls = withStreamed(record, message.tool_calls ?? [])
    const ids = new Set(calls.map(call => call.id))
    // Id-less fragments are accounted for by the record; an unparsed call it left out stays invalid.
    const invalid = (message.invalid_tool_calls ?? []).filter(call => named(call.id) && !ids.has(call.id))

    return { calls, invalid }
  }

  const fromChunks = (chunks: readonly ToolCallChunk[], streamed: readonly ToolCall[]): RebuiltCalls => {
    const calls: ToolCall[] = []
    const invalid: InvalidToolCall[] = []
    for (const group of groupsOf(chunks)) {
      const text = group.args.join('')
      const args = jsonHelper.parseArguments(text)
      if (named(group.id) && group.name != null && args != null) {
        calls.push({ id: group.id, name: group.name, args, type: 'tool_call' })
        continue
      }
      // A group still unparseable: the streamed call of its id stands in, else it stays invalid.
      const standIn = named(group.id) ? streamed.find(call => call.id === group.id) : undefined
      if (standIn != null) {
        calls.push(standIn)
      } else {
        invalid.push({
          ...(group.id != null ? { id: group.id } : {}), ...(group.name != null ? { name: group.name } : {}),
          args: text, error: 'Malformed args.', type: 'invalid_tool_call',
        })
      }
    }

    return { calls: withStreamed(calls, streamed), invalid }
  }

  /** The calls rebuilt, or `undefined` when the streamed ones stand as they are. */
  const rebuild = (message: AIMessage | AIMessageChunk, plugin?: LlmPlugin): RebuiltCalls | undefined => {
    const record = plugin?.toolCallsOf?.(message)
    if (record != null && record.length > 0) {
      return fromRecord(record, message)
    }
    const chunks = (message as Partial<AIMessageChunk>).tool_call_chunks ?? []
    if ((message.invalid_tool_calls ?? []).length === 0 || chunks.length === 0) {
      return undefined
    }

    return fromChunks(chunks, message.tool_calls ?? [])
  }

  const same = (left: readonly ToolCall[], right: readonly ToolCall[]): boolean =>
    left.length === right.length && left.every((call, i) =>
      call.id === right[i]!.id && call.name === right[i]!.name && JSON.stringify(call.args) === JSON.stringify(right[i]!.args))

  const reconcile: ToolCallsHelper['reconcile'] = (message, plugin) =>
    rebuild(message, plugin)?.calls ?? message.tool_calls ?? []

  const messageOf: ToolCallsHelper['messageOf'] = (piece, plugin) => {
    const message = new AIMessage(piece)
    const rebuilt = rebuild(piece, plugin)
    if (rebuilt == null
      || (same(rebuilt.calls, message.tool_calls ?? []) && rebuilt.invalid.length === (message.invalid_tool_calls ?? []).length)) {
      return message
    }

    return new AIMessage({
      content: message.content,
      ...(message.id != null ? { id: message.id } : {}),
      ...(message.name != null ? { name: message.name } : {}),
      additional_kwargs: message.additional_kwargs,
      response_metadata: message.response_metadata,
      ...(message.usage_metadata != null ? { usage_metadata: message.usage_metadata } : {}),
      tool_calls: rebuilt.calls,
      invalid_tool_calls: rebuilt.invalid,
    })
  }

  return { reconcile, messageOf }
}

export const toolCallsHelper = createToolCallsHelper()
