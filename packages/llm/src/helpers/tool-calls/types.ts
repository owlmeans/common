import type { AIMessage, AIMessageChunk, ToolCall } from '@langchain/core/messages'
import type { LlmPlugin } from '../../plugins/types.js'

/**
 * The tool calls of a STREAMED completion, made whole. langchain derives `tool_calls` from the
 * concatenated chunks and joins a call's argument fragments to it by position; a stream whose
 * fragments carry no usable position (several calls in one answer, through some proxies) leaves the
 * calls with empty arguments and the fragments as invalid calls.
 */
export interface ToolCallsHelper {
  /**
   * The completion's tool calls, complete: the provider's own record of them
   * (`LlmPlugin.toolCallsOf`) where the plugin keeps one, else — when langchain could not parse
   * some — the streamed chunks regrouped by id, then position, then stream order. Ids are kept and
   * no call is dropped: a call no source completes keeps its streamed form.
   */
  reconcile: (message: AIMessage | AIMessageChunk, plugin?: LlmPlugin) => ToolCall[]
  /**
   * The completion as ONE message whose `tool_calls` are {@link reconcile}d (fragments a record
   * accounts for leave `invalid_tool_calls`) — exactly `new AIMessage(piece)` when nothing changed.
   */
  messageOf: (piece: AIMessageChunk, plugin?: LlmPlugin) => AIMessage
}
