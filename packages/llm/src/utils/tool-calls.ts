import { AIMessage, BaseMessage, ToolMessage, type MessageContent, type ToolCall } from '@langchain/core/messages'
import { logger } from '@owlmeans/log'
import { EMPTY_CONTENT_STUB } from '../consts.js'
import { LlmMissconfiguredError } from '../errors.js'
import { retryHelper } from '../helpers/retry.js'
import { CARRIED_LOOKUPS_HEADER, NO_ARGUMENTS_SCHEMA, TOOL_ERROR_PREFIX } from './tool-calls/consts.js'
import type { ToolCallUtils } from './tool-calls/types.js'

const log = logger('llm')

export const createToolCallUtils = (): ToolCallUtils => {
  const textOf: ToolCallUtils['textOf'] = content => {
    if (typeof content === 'string') {
      return content.trim()
    }
    if (Array.isArray(content)) {
      return content
        .map(part => {
          const text = (part as unknown as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        })
        .filter(text => text !== '')
        .join('\n\n')
        .trim()
    }
    return ''
  }

  /** A tool's output as the text the model reads back; never blank, which a provider refuses. */
  const outputText = (output: unknown): string => {
    const text = typeof output === 'string'
      ? output
      : output instanceof BaseMessage ? textOf(output.content) : JSON.stringify(output) ?? String(output)

    return text.trim() === '' ? EMPTY_CONTENT_STUB : text
  }

  const answer = (call: ToolCall, content: string, status: 'success' | 'error'): ToolMessage =>
    new ToolMessage({ tool_call_id: call.id ?? call.name, name: call.name, content, status })

  const definitions: ToolCallUtils['definitions'] = (look, stop, output) => [
    ...look,
    ...stop.map(tool => ({
      type: 'function' as const,
      function: { name: tool.name, description: tool.description, parameters: tool.parameters ?? { ...NO_ARGUMENTS_SCHEMA } },
    })),
    ...(output != null
      ? [{
        type: 'function' as const,
        function: {
          name: output.name, description: '', parameters: output.parameters as Record<string, unknown>,
          ...(output.strict ? { strict: true } : {}),
        },
      }]
      : []),
  ]

  const assertDistinct: ToolCallUtils['assertDistinct'] = names => {
    const seen = new Set<string>()
    for (const name of names) {
      if (seen.has(name)) {
        throw new LlmMissconfiguredError(`tool-name-taken:${name}`)
      }
      seen.add(name)
    }
  }

  const run: ToolCallUtils['run'] = async (call, tools, fatal) => {
    const tool = tools.find(candidate => candidate.name === call.name)
    if (tool == null) {
      return answer(call, `${TOOL_ERROR_PREFIX}Tool ${call.name} not found`, 'error')
    }
    try {
      return answer(call, outputText(await tool.invoke(call.args as never)), 'success')
    } catch (e) {
      const abort = retryHelper.isFatalError(e, fatal)
      if (abort != null) {
        throw abort
      }
      log.debug('Look tool failed, the model reads the error', { tool: call.name, error: e })

      return answer(call, `${TOOL_ERROR_PREFIX}${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  const reply: ToolCallUtils['reply'] = (call, content, ok) => answer(call, content, ok ? 'success' : 'error')

  const neutral: ToolCallUtils['neutral'] = (message, calls = message.tool_calls ?? []) => new AIMessage({
    content: textOf(message.content),
    ...(calls.length > 0
      ? { tool_calls: calls.map(call => ({ id: call.id, name: call.name, args: call.args, type: 'tool_call' as const })) }
      : {}),
    ...(message.id != null ? { id: message.id } : {}),
  })

  const noteOf: ToolCallUtils['noteOf'] = (rounds, header = CARRIED_LOOKUPS_HEADER) => {
    const results = new Map<string, string>()
    for (const message of rounds) {
      if (message instanceof ToolMessage) {
        results.set(message.tool_call_id, textOf(message.content as MessageContent))
      }
    }
    const entries: string[] = []
    for (const message of rounds) {
      if (!(message instanceof AIMessage)) {
        continue
      }
      for (const call of message.tool_calls ?? []) {
        entries.push(`### ${call.name} ${JSON.stringify(call.args)}\n\n${results.get(call.id ?? call.name) ?? EMPTY_CONTENT_STUB}`)
      }
    }

    return [header, ...entries].join('\n\n')
  }

  const onlyCalls: ToolCallUtils['onlyCalls'] = message =>
    (message.tool_calls?.length ?? 0) > 0 && textOf(message.content) === ''

  return { definitions, assertDistinct, run, reply, textOf, neutral, noteOf, onlyCalls }
}

export const toolCallUtils = createToolCallUtils()
