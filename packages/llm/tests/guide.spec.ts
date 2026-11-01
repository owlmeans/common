import { configureLog, logConfig } from '@owlmeans/log'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { AIMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { JSONSchemaType } from 'ajv'
import { LlmMissconfiguredError, LlmModelError, LlmOutputRejection, LlmRetryExceededError, makeLlmModel } from '@owlmeans/llm'
import type { LlmFailedAttempt, LlmSpectator } from '@owlmeans/llm'

/**
 * Guided regeneration: a refused answer hands its refusal to the call's `guide`, and the NEXT
 * attempt carries what the guide wrote after the caller's own messages. Offline — the model is a
 * stand-in that answers from a script and records every request it was sent.
 */

interface Named { name: string }

const NamedSchema: JSONSchemaType<Named> = {
  type: 'object', title: 'Named', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false,
}

const spectator = { log: async () => undefined } as unknown as LlmSpectator

/** Answers the script in order (the last one repeats) and records each request's messages as JSON. */
const scripted = (answers: string[]): { model: BaseChatModel, sent: string[] } => {
  const sent: string[] = []
  const stream = async (messages: unknown[]) => {
    sent.push(JSON.stringify(messages))
    const text = answers[Math.min(sent.length - 1, answers.length - 1)]!

    return (async function* () { yield new AIMessageChunk({ content: text }) })()
  }
  const model = {
    getName: () => 'scripted', lc_kwargs: { model: 'scripted' }, stream, bindTools: () => ({ stream }),
  } as unknown as BaseChatModel

  return { model, sent }
}

const llmOf = (model: BaseChatModel, retries = 4) => makeLlmModel({ model, purpose: { type: 'guide-spec' }, retries }, spectator)

const lastMessage = (request: string): string => {
  const messages = JSON.parse(request) as { content: unknown }[]

  return JSON.stringify(messages[messages.length - 1]!.content)
}

let level: ReturnType<typeof logConfig>['level']
beforeAll(() => { level = logConfig().level; configureLog({ level: 'silent' }) })
afterAll(() => { configureLog({ level }) })

describe('@owlmeans/llm — guided regeneration', () => {
  test('a filter rejection with details reaches the guide, and the next attempt carries its message', async () => {
    const { model, sent } = scripted(['{"name":"Заказы"}', '{"name":"Orders"}'])
    const seen: LlmFailedAttempt<Named>[] = []
    const result = await llmOf(model).invoke('Name the section', NamedSchema, {
      action: 'guided-filter',
      filter: named => {
        if (/^[A-Za-z]+$/.test(named.name)) return named
        throw new LlmOutputRejection('non-latin-name', { name: named.name })
      },
      guide: failed => {
        seen.push(failed)
        return `Your name "${failed.output.name}" is not Latin: answer again.`
      },
    })

    expect(result).toEqual({ name: 'Orders' })
    expect(sent).toHaveLength(2)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.attempt).toBe(0)
    expect(seen[0]!.output).toEqual({ name: 'Заказы' })
    expect(seen[0]!.error).toBeInstanceOf(LlmOutputRejection)
    expect((seen[0]!.error as LlmOutputRejection).details).toEqual({ name: 'Заказы' })
    expect(lastMessage(sent[0]!)).not.toContain('answer again')
    expect(lastMessage(sent[1]!)).toContain('Your name \\"Заказы\\" is not Latin: answer again.')
    // The caller's own request is still there, ahead of the guidance.
    expect(sent[1]!).toContain('Name the section')
  })

  test('a schema refusal reaches the guide with the validation error', async () => {
    const { model, sent } = scripted(['{"title":"x"}', '{"name":"Orders"}'])
    const seen: LlmFailedAttempt<Named>[] = []
    const result = await llmOf(model).invoke('Name the section', NamedSchema, {
      action: 'guided-schema',
      guide: failed => { seen.push(failed); return 'The answer needs a "name".' },
    })

    expect(result).toEqual({ name: 'Orders' })
    expect(seen).toHaveLength(1)
    expect(String((seen[0]!.error as LlmModelError).message)).toContain('validation-failed')
    expect(lastMessage(sent[1]!)).toContain('The answer needs a \\"name\\".')
  })

  test('the latest refusal replaces the previous guidance', async () => {
    const { model, sent } = scripted(['{"name":"Один"}', '{"name":"Два"}', '{"name":"Three"}'])
    await llmOf(model).invoke('Name it', NamedSchema, {
      action: 'guided-replace',
      filter: named => /^[A-Za-z]+$/.test(named.name) ? named : null,
      guide: failed => `refused attempt ${failed.attempt}`,
    })

    expect(sent).toHaveLength(3)
    expect(sent[2]!).toContain('refused attempt 1')
    expect(sent[2]!).not.toContain('refused attempt 0')
  })

  test('without a guide, or with a null one, every attempt sends the same request', async () => {
    const unguided = scripted(['{"name":"Один"}', '{"name":"Two"}'])
    await llmOf(unguided.model).invoke('Name it', NamedSchema, {
      action: 'unguided', filter: named => /^[A-Za-z]+$/.test(named.name) ? named : null,
    })
    expect(unguided.sent).toHaveLength(2)
    expect(unguided.sent[1]).toBe(unguided.sent[0]!)

    const silent = scripted(['{"name":"Один"}', '{"name":"Two"}'])
    await llmOf(silent.model).invoke('Name it', NamedSchema, {
      action: 'null-guide', filter: named => /^[A-Za-z]+$/.test(named.name) ? named : null, guide: () => null,
    })
    expect(silent.sent[1]).toBe(silent.sent[0]!)
  })

  test('a guide that throws never replaces the attempt error and leaves the next attempt unguided', async () => {
    const { model, sent } = scripted(['{"name":"Один"}', '{"name":"Two"}'])
    const result = await llmOf(model).invoke('Name it', NamedSchema, {
      action: 'broken-guide',
      filter: named => /^[A-Za-z]+$/.test(named.name) ? named : null,
      guide: () => { throw new Error('guide broke') },
    })

    expect(result).toEqual({ name: 'Two' })
    expect(sent[1]).toBe(sent[0]!)
  })

  test('a fatal refusal never reaches the guide', async () => {
    const { model } = scripted(['{"name":"Один"}'])
    let called = 0
    await expect(llmOf(model).invoke('Name it', NamedSchema, {
      action: 'fatal',
      filter: () => { throw new LlmMissconfiguredError('stop') },
      guide: () => { called += 1; return 'never' },
    })).rejects.toBeInstanceOf(LlmMissconfiguredError)
    expect(called).toBe(0)
  })

  test('ask hands the refused text to its guide', async () => {
    const { model, sent } = scripted(['Заказы', 'Orders'])
    const outputs: string[] = []
    const answer = await llmOf(model).ask('Name the section', {
      action: 'guided-ask',
      filter: text => /^[A-Za-z]+$/.test(text.trim()) ? text.trim() : null,
      guide: failed => { outputs.push(failed.output); return 'Use Latin letters only.' },
    })

    expect(answer).toBe('Orders')
    expect(outputs).toEqual(['Заказы'])
    expect(lastMessage(sent[1]!)).toContain('Use Latin letters only.')
  })

  test('the retries still end the call when every guided attempt is refused', async () => {
    const { model, sent } = scripted(['{"name":"Один"}'])
    await expect(llmOf(model, 2).invoke('Name it', NamedSchema, {
      action: 'exhausted', filter: () => null, guide: () => 'again',
    })).rejects.toBeInstanceOf(LlmRetryExceededError)
    expect(sent).toHaveLength(2)
  })
})
