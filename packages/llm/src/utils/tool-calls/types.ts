import type { BindToolsInput } from '@langchain/core/language_models/chat_models'
import type { AIMessage, BaseMessage, MessageContent, ToolCall, ToolMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { FatalErrorResolver } from '../../helpers/retry/types.js'
import type { LlmStopTool } from '../../types.js'

/** The structured-output tool of an `invoke` that converses with look tools. */
export interface OutputTool {
  name: string
  /** The JSON Schema of the answer. */
  parameters: unknown
  /** Sent `strict` (`LlmPlugin.strictTool`). */
  strict: boolean
}

/** The pieces of one tool round that need no model: declaring, running and recounting tool calls. */
export interface ToolCallUtils {
  /**
   * What a binding declares: the look tools as given, then each stop tool and the output tool as an
   * OpenAI-shaped function definition — the spelling every provider converts.
   */
  definitions: (look: StructuredToolInterface[], stop: LlmStopTool<unknown>[], output?: OutputTool) => BindToolsInput[]
  /** Refuse two tools of one name, fatally: the model could call only one of them. */
  assertDistinct: (names: string[]) => void
  /**
   * Run one look call, contained: its output as the tool message, a thrown error as an error tool
   * message the model reads and corrects — unless `retryHelper.isFatalError` names it fatal, which is
   * thrown. A name no tool carries is answered as not found.
   */
  run: (call: ToolCall, tools: StructuredToolInterface[], fatal?: FatalErrorResolver) => Promise<ToolMessage>
  /** A tool message answering a call with text the loop writes — why it was not run, or that it was taken. */
  reply: (call: ToolCall, content: string, ok: boolean) => ToolMessage
  /** The text parts of a content, joined — what is left of an answer without its provider blocks. */
  textOf: (content: MessageContent | undefined) => string
  /**
   * A provider-neutral copy of an assistant turn: its text and the tool calls given (all of its own
   * when omitted), no provider block — safe to send to any model, continued in any later call.
   */
  neutral: (message: AIMessage, calls?: ToolCall[]) => AIMessage
  /**
   * Look-ups as one note, for a turn that cannot be handed them as tool messages — another model,
   * another provider, one with no tools at all, or `ask`'s tool-less answer. `header` opens it
   * (default: the carried-over header of earlier attempts).
   */
  noteOf: (rounds: readonly BaseMessage[], header?: string) => string
  /** The turn called tools and said nothing — what a turn that may no longer look must not answer. */
  onlyCalls: (message: AIMessage) => boolean
}
