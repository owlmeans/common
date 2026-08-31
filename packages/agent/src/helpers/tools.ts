import type { ToolCall } from '@langchain/core/messages'
import type { AgentToolSet } from '../types.js'

/** The shape a contained tool failure comes back as. Matches what tool bodies return themselves. */
export interface ToolErrorResponse { error: string }

export const toErrorResponse = (e: unknown): ToolErrorResponse =>
  ({ error: `Error during tool call: ${(e instanceof Error) ? e.message : String(e)}` })

export const isToolError = (result: unknown): result is ToolErrorResponse =>
  typeof result === 'object' && result != null && 'error' in result

/**
 * Run one model-requested tool, contained.
 *
 * **Never throws.** The caller wraps this in a LangGraph task, and a rejected task aborts the whole
 * superstep: every sibling tool call in the same parallel batch dies with AbortError and the run
 * ends on "Multiple errors occurred during superstep 0", discarding work the other calls had
 * already finished. A tool failure has to come back as something the model can read and correct
 * instead — most of them are the model's own mistake (an argument outside an enum, a hallucinated
 * tool name), and the error text already names what was expected.
 *
 * Awaiting `invoke` is what makes the catch reachable: the tool's schema is validated inside it, so
 * a bad argument rejects asynchronously and returning the promise unawaited would carry the
 * rejection straight past this handler.
 *
 * Resolution is by the tool's OWN name, not by the map key. `bindTools` advertises `tool.name`, so
 * that is what the model calls — a map keyed by a local variable silently loses any tool whose two
 * names drifted apart, leaving it advertised, callable, and permanently "not found". The key stays
 * as a fallback so a caller may still address a tool by it.
 */
export const safeInvokeTool = async (tools: AgentToolSet, toolCall: ToolCall): Promise<unknown> => {
  const tool = tools[toolCall.name]
    ?? Object.values(tools).find(entry => entry.name === toolCall.name)

  if (tool == null) {
    return toErrorResponse(new Error(`Tool ${toolCall.name} not found`))
  }

  try {
    return await tool.invoke(toolCall.args)
  } catch (e) {
    console.warn(`Error during tool call ${toolCall.name}:`, e)
    return toErrorResponse(e)
  }
}
