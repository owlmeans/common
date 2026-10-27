import { AIMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

/**
 * A model whose answers are decided in advance — the same double `@owlmeans/agent`'s own specs use
 * (`FakeStreamingChatModel` always replays its first response and cannot drive a tool loop). It
 * stands in for the MODEL, an external boundary, never for an `@owlmeans/*` package; the agent only
 * asks a model for `bindTools` and `stream`, so that is all it implements.
 */
export interface ScriptedTurn {
  content?: string
  toolCalls?: Array<{ name: string, args: Record<string, unknown> }>
}

export interface ScriptedModel {
  model: BaseChatModel
  /** The message lists it was asked with, in order. */
  asked: () => unknown[][]
  /** The tool names the asking view was bound with, per ask — `null` for the unbound model. */
  bound: () => Array<string[] | null>
}

export const scriptedModel = (script: ScriptedTurn[]): ScriptedModel => {
  let at = 0
  const asked: unknown[][] = []
  const bound: Array<string[] | null> = []

  const answer = (tools: string[] | null) => async (messages: unknown[]) => {
    asked.push(messages)
    bound.push(tools)
    const turn = script[Math.min(at, script.length - 1)]
    at += 1
    const chunk = new AIMessageChunk({
      content: turn.content ?? '',
      tool_calls: (turn.toolCalls ?? []).map((call, index) => ({
        name: call.name, args: call.args, id: `call_${at}_${index}`, type: 'tool_call' as const,
      })),
    })

    return (async function* () { yield chunk })()
  }

  const model = {
    bindTools: (tools: Array<{ name: string }>) => ({ ...model, stream: answer(tools.map(item => item.name)) }),
    stream: answer(null),
  }

  return { model: model as unknown as BaseChatModel, asked: () => asked, bound: () => bound }
}
