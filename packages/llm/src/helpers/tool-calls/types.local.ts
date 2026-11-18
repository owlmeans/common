import type { InvalidToolCall, ToolCall } from '@langchain/core/messages'

/** The streamed chunks of one call, regrouped. */
export interface ChunkGroup {
  id?: string
  name?: string
  index?: number | string
  args: string[]
}

/** What a rebuild settled on: the calls, and what is still unparseable. */
export interface RebuiltCalls {
  calls: ToolCall[]
  invalid: InvalidToolCall[]
}
