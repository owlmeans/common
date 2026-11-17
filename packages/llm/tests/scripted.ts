import { AIMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { JSONSchemaType } from 'ajv'
import { llmPluginRegistry, openAiPlugin } from '../src/index.js'
import type { LlmRefineParams, LlmSpectator, LlmSpectatorNotice } from '../src/index.js'

/** One `refine` call: the parameters, and which rung of the chain it rebuilt. */
export interface RefineCall extends LlmRefineParams {
  rung: number
}

export interface ScriptedChain {
  /** The primary; each fallback hangs off the one before it. */
  model: BaseChatModel
  /** Every `refine` call, in order — one per attempt. */
  refines: RefineCall[]
  /** Every request, as JSON of the messages sent. */
  sent: string[]
}

let seq = 0

/**
 * A chain of stand-in rungs answering one script in order (the last answer repeats), resolved
 * through a copy of the OpenAI plugin whose `refine` records what it is handed. Offline.
 */
export const scriptedChain = (answers: string[], rungs = 1): ScriptedChain => {
  const refines: RefineCall[] = []
  const sent: string[] = []
  const provider = `spec-scripted-${seq++}`
  const stream = async (messages: unknown[]) => {
    sent.push(JSON.stringify(messages))
    const text = answers[Math.min(sent.length - 1, answers.length - 1)]!

    return (async function* () { yield new AIMessageChunk({ content: text }) })()
  }
  const models: BaseChatModel[] = []
  for (let index = rungs - 1; index >= 0; index--) {
    models.unshift({
      getName: () => `rung-${index}`,
      lc_kwargs: { model: `rung-${index}` },
      metadata: { config: { alias: 'spec', provider, model: `rung-${index}` } },
      stream,
      bindTools: () => ({ stream }),
      __fallbackModel: models[0],
    } as unknown as BaseChatModel)
  }
  llmPluginRegistry.register({
    ...openAiPlugin, type: provider, family: provider, owns: candidate => models.includes(candidate),
    refine: params => {
      refines.push({ ...params, rung: models.indexOf(params.base) })
      return params.base
    },
    patchPrompt: undefined, loopCache: undefined, cacheDialect: undefined, isFatal: undefined, schemaDefects: undefined,
  })

  return { model: models[0]!, refines, sent }
}

/** The last message of a recorded request, as JSON. */
export const lastMessage = (request: string): string => {
  const messages = JSON.parse(request) as { content: unknown }[]

  return JSON.stringify(messages[messages.length - 1]!.content)
}

export interface NoticeSpectator extends LlmSpectator {
  notices: LlmSpectatorNotice[]
}

/** A spectator that keeps every notice; `fail` makes the observer throw (`sync`) or reject (`async`) after recording. */
export const noticeSpectator = (fail?: 'sync' | 'async'): NoticeSpectator => {
  const notices: LlmSpectatorNotice[] = []
  return {
    notices,
    log: async () => undefined as never,
    notice: event => {
      notices.push(event)
      if (fail === 'sync') throw new Error('observer broke')
      if (fail === 'async') return Promise.reject(new Error('observer broke'))
    },
  }
}

export interface Named { name: string }

export const NamedSchema: JSONSchemaType<Named> = {
  type: 'object', title: 'Named', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false,
}
