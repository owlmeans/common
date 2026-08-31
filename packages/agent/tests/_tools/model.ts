import { AIMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

/**
 * A model whose answers are decided in advance.
 *
 * `@langchain/core`'s own `FakeStreamingChatModel` always replays its first response, so it cannot
 * drive a tool loop — the second turn would repeat the first turn's tool call forever. This one
 * advances, which is the whole behaviour a loop test is about.
 *
 * It is a double for the MODEL, an external boundary, not for any `@owlmeans/*` package. The agent
 * only ever asks a model for `bindTools` and `stream`, so that is all it implements.
 */
export interface ScriptedTurn {
  content?: string
  toolCalls?: Array<{ name: string, args: Record<string, unknown> }>
}

export interface ScriptedModel {
  model: BaseChatModel
  /** How many times the model was asked. */
  turns: () => number
  /** The message lists it was asked with, in order. */
  asked: () => unknown[][]
}

export const scriptedModel = (script: ScriptedTurn[]): ScriptedModel => {
  let at = 0
  const asked: unknown[][] = []

  const model = {
    bindTools: () => model,
    stream: async (messages: unknown[]) => {
      asked.push(messages)
      const turn = script[Math.min(at, script.length - 1)]
      at += 1

      const chunk = new AIMessageChunk({
        content: turn.content ?? '',
        tool_calls: (turn.toolCalls ?? []).map((call, index) => ({
          name: call.name, args: call.args, id: `call_${at}_${index}`, type: 'tool_call' as const,
        })),
      })

      return (async function* () { yield chunk })()
    },
  }

  return { model: model as unknown as BaseChatModel, turns: () => at, asked: () => asked }
}
