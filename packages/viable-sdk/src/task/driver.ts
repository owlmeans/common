import { ModelTaskMode, ModelTaskResultKind, ModelTaskRole } from '@owlmeans/viable-common'
import type { ModelTask, ModelTaskResult } from '@owlmeans/viable-common'

/**
 * Something that can answer a model task without a coding agent in front of it.
 *
 * Two consumers, and both are the reason it is an interface rather than a function on the session:
 * the end-to-end tests, which have to play the parent agent deterministically, and the CLI this
 * SDK exists to make possible, where the "parent agent" is the CLI's own model.
 */
export interface TaskDriver {
  answer: (task: ModelTask) => Promise<ModelTaskResult>
}

/** The minimum a chat model must offer to stand in for a parent agent. */
export interface DriverModel {
  invoke: (messages: Array<{ role: string, content: string }>) => Promise<string>
}

export interface LangchainLikeModel {
  invoke: (messages: unknown) => Promise<{ content: unknown }>
  bindTools?: (tools: unknown[], kwargs?: unknown) => LangchainLikeModel
}

export interface ModelDriverOptions {
  /** One model per tier. A tier with no model falls back to the first one given. */
  models: Partial<Record<string, LangchainLikeModel>>
}

const textOf = (content: unknown): string => typeof content === 'string'
  ? content
  : Array.isArray(content)
    ? content.map(part => (part as { text?: string }).text ?? '').join('')
    : String(content ?? '')

const ROLE_TO_LC: Record<ModelTaskRole, string> = {
  [ModelTaskRole.System]: 'system',
  [ModelTaskRole.User]: 'user',
  [ModelTaskRole.Assistant]: 'assistant',
  // A chat model called without the tool definitions cannot receive a tool turn; the content is
  // what mattered anyway, and presenting it as a user turn keeps the conversation readable.
  [ModelTaskRole.Tool]: 'user',
}

/**
 * A reference parent agent, backed by a chat model.
 *
 * It does what the envelope asks a real parent to do — run the task in isolation, produce exactly
 * the shape requested — with the instruction written as a system message rather than as guidance
 * to a human-facing agent. What it is NOT is a second implementation of the protocol: it consumes
 * the same `ModelTask` a coding agent receives and produces the same `ModelTaskResult`, so a test
 * driven by it exercises the platform's half exactly as a real one would.
 */
/**
 * The tool calls in an answer, or `null` when it carries none.
 *
 * Three shapes rather than one, because models produce three: the documented array, a bare object
 * for a single call, and an array wrapped under `tool_calls`. Assuming the array threw
 * `parsed.map is not a function`, the TypeError was handed back AS the answer, and the model ladder
 * retried against feedback that said nothing about what was wrong.
 *
 * `null` rather than a throw for an answer with no call in it: a model with tools bound says it is
 * finished by NOT calling one, and refusing that stalls the agent loop it was ending.
 */
const toolCallsOf = (
  parsed: unknown
): Array<{ name: string, args: Record<string, unknown> }> | null => {
  const wrapper = parsed as { tool_calls?: unknown, toolCalls?: unknown } | null
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(wrapper?.tool_calls)
      ? wrapper.tool_calls
      : Array.isArray(wrapper?.toolCalls)
        ? wrapper.toolCalls
        : typeof (parsed as { name?: unknown })?.name === 'string'
          ? [parsed]
          : null

  if (list == null || list.length < 1) return null

  return (list as Array<{ name?: unknown, args?: Record<string, unknown> }>).map(call => {
    if (typeof call?.name !== 'string') {
      throw new SyntaxError('a tool call must carry a "name"')
    }

    return { name: call.name, args: call.args ?? {} }
  })
}

export const makeModelTaskDriver = (opts: ModelDriverOptions): TaskDriver => {
  const pick = (tier?: string): LangchainLikeModel => {
    const chosen = tier != null ? opts.models[tier] : undefined
    const fallback = Object.values(opts.models).find(model => model != null)
    const model = chosen ?? fallback
    if (model == null) throw new Error('the task driver was given no models')

    return model
  }

  return {
    answer: async task => {
      const instruction = task.mode === ModelTaskMode.Json
        ? 'Answer with exactly one JSON object matching this schema, and nothing else — no prose, '
          + `no code fence:\n${JSON.stringify(task.outputSchema ?? {})}`
        : task.mode === ModelTaskMode.Tools
          ? 'Answer with a JSON array of tool calls ({"name","args"}) and nothing else, OR — if no'
            + ' tool call is needed and the work is done — with plain text:\n'
            + JSON.stringify(task.tools ?? [])
          : 'Answer with plain text.'

      const messages = [
        ...(task.system != null ? [{ role: 'system', content: task.system }] : []),
        ...task.messages.map(message => ({
          role: ROLE_TO_LC[message.role],
          content: message.content,
        })),
        { role: 'system', content: instruction },
        ...(task.feedback != null
          ? [{ role: 'system', content: `The previous answer was refused: ${task.feedback}` }]
          : []),
      ]

      try {
        const answer = await pick(task.tier).invoke(messages)
        const text = textOf(answer.content)

        if (task.mode === ModelTaskMode.Text) {
          return { taskId: task.id, kind: ModelTaskResultKind.Text, text }
        }

        const body = text.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim()

        let parsed: unknown
        try {
          parsed = JSON.parse(body)
        } catch (e) {
          // Prose where tools were offered is the model saying it is done, not a bad answer.
          if (task.mode === ModelTaskMode.Tools) {
            return { taskId: task.id, kind: ModelTaskResultKind.Text, text }
          }

          throw e
        }

        if (task.mode === ModelTaskMode.Json) {
          return { taskId: task.id, kind: ModelTaskResultKind.Json, json: parsed }
        }

        const calls = toolCallsOf(parsed)

        return calls == null
          ? { taskId: task.id, kind: ModelTaskResultKind.Text, text }
          : { taskId: task.id, kind: ModelTaskResultKind.ToolCalls, toolCalls: calls }
      } catch (e) {
        // Reported rather than thrown: the platform treats a reported failure as a bad answer and
        // asks again with the reason, which is the behaviour a real parent agent would produce
        // when its subagent came back with nothing usable.
        return { taskId: task.id, kind: ModelTaskResultKind.Error, error: (e as Error).message }
      }
    },
  }
}
