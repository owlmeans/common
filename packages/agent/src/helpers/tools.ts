import type { ToolCall } from '@langchain/core/messages'
import { logger } from '@owlmeans/log'
import type { AgentToolSet } from '../types.js'
import type { ToolErrorResponse, ToolHelper } from './tools/types.js'

const log = logger('agent:tools')

export const createToolHelper = (): ToolHelper => {
  const toErrorResponse = (e: unknown): ToolErrorResponse =>
    ({ error: `Error during tool call: ${(e instanceof Error) ? e.message : String(e)}` })

  const isToolError = (result: unknown): result is ToolErrorResponse =>
    typeof result === 'object' && result != null && 'error' in result

  const safeInvokeTool = async (
    tools: AgentToolSet, toolCall: ToolCall, fatal?: (e: unknown) => boolean,
  ): Promise<unknown> => {
    const tool = tools[toolCall.name]
      ?? Object.values(tools).find(entry => entry.name === toolCall.name)

    if (tool == null) {
      return toErrorResponse(new Error(`Tool ${toolCall.name} not found`))
    }

    try {
      return await tool.invoke(toolCall.args)
    } catch (e) {
      if (fatal?.(e) === true) {
        throw e
      }
      log.warn('Tool call failed', { tool: toolCall.name, error: e })
      return toErrorResponse(e)
    }
  }

  return { toErrorResponse, isToolError, safeInvokeTool }
}

export const toolHelper = createToolHelper()

/** @deprecated compat:factory-refactor — use `toolHelper.toErrorResponse(…)` */
export const toErrorResponse = (e: unknown): ToolErrorResponse => toolHelper.toErrorResponse(e)

/** @deprecated compat:factory-refactor — use `toolHelper.isToolError(…)` */
export const isToolError = (result: unknown): result is ToolErrorResponse => toolHelper.isToolError(result)

/** @deprecated compat:factory-refactor — use `toolHelper.safeInvokeTool(…)` */
export const safeInvokeTool = (
  tools: AgentToolSet, toolCall: ToolCall, fatal?: (e: unknown) => boolean,
): Promise<unknown> => toolHelper.safeInvokeTool(tools, toolCall, fatal)
