import { configureLog, logConfig } from '@owlmeans/log'
import { describe, expect, test } from 'bun:test'
import { AIMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { JSONSchemaType } from 'ajv'
import {
  anthropicPlugin, isFatalError, LlmMissconfiguredError, makeLlmModel, OPENAI_HIDDEN_PROPERTY_NAMES,
  openAiPlugin, registerLlmPlugin,
} from '@owlmeans/llm'
import type { LlmPlugin, LlmSpectator } from '@owlmeans/llm'
import { hiddenPropertyNames } from '../src/utils/schema.js'

/**
 * OpenAI's non-strict `json_schema` rendering strips JSON-schema keywords by KEY NAME, a
 * `properties` map included, so a property named `required` never reaches the model and fails
 * validation identically on every retry. A schema like that is refused before the first request.
 */

const field = (name: string) => ({
  title: 'shelf',
  type: 'object',
  properties: { label: { type: 'string' }, [name]: { type: 'boolean' } },
  required: ['label', name],
  additionalProperties: false,
})

describe('@owlmeans/llm — property names a provider does not show', () => {
  test('a property named like a keyword is found, with its JSON pointer, at any depth', () => {
    expect(hiddenPropertyNames(field('required'), OPENAI_HIDDEN_PROPERTY_NAMES))
      .toEqual(['#/properties/required: a property named "required" is not shown to the model'])
    const nested = {
      type: 'object',
      properties: {
        tools: { type: 'array', items: { type: 'object', properties: { default: { type: 'string' } } } },
        spare: { anyOf: [{ type: 'object', properties: { format: { type: 'string' } } }, { type: 'null' }] },
      },
      $defs: { bin: { type: 'object', properties: { pattern: { type: 'string' } } } },
    }
    expect(hiddenPropertyNames(nested, OPENAI_HIDDEN_PROPERTY_NAMES).map(line => line.split(':')[0])).toEqual([
      '#/properties/tools/items/properties/default',
      '#/properties/spare/anyOf/0/properties/format',
      '#/$defs/bin/properties/pattern',
    ])
  })

  test('the same schema with another name, and keywords in keyword position, pass', () => {
    expect(hiddenPropertyNames(field('mandatory'), OPENAI_HIDDEN_PROPERTY_NAMES)).toEqual([])
    for (const shown of ['type', 'properties', 'items', 'enum', 'const', 'description', 'title', 'nullable', 'anyOf', 'oneOf']) {
      expect([shown, hiddenPropertyNames(field(shown), OPENAI_HIDDEN_PROPERTY_NAMES)]).toEqual([shown, []])
    }
  })

  test('only the OpenAI json_schema path declares the defect', () => {
    expect(openAiPlugin.schemaDefects?.({ model: 'gpt-6-sol' }, field('required'))).toHaveLength(1)
    // Function calling keeps every property name.
    expect(openAiPlugin.schemaDefects?.({ model: 'gpt-6-sol', structuredOutput: false }, field('required'))).toEqual([])
    expect(anthropicPlugin.schemaDefects).toBeUndefined()
  })

  test('a misconfiguration is fatal to every retry loop', () => {
    const error = new LlmMissconfiguredError('x')
    expect(isFatalError(error)).toBe(error)
  })
})

describe('@owlmeans/llm — a hidden property fails the call before any request', () => {
  let seq = 0
  interface Shelf { label: string }
  const spectator = { log: async () => undefined } as unknown as LlmSpectator

  /** A stand-in for the provider boundary, resolved through a copy of a real plugin. */
  const scripted = (base: LlmPlugin, model: string, reply: string, extra: Record<string, unknown> = {}) => {
    const calls: unknown[] = []
    const provider = `spec-schema-${seq++}`
    const answer = async (msgs: unknown) => {
      calls.push(msgs)
      return (async function* () { yield new AIMessageChunk({ content: reply }) })()
    }
    const fake = {
      getName: () => 'fake',
      lc_kwargs: { model },
      metadata: { config: { alias: 'spec', provider, model, ...extra } },
      stream: answer,
      bindTools: () => ({ stream: answer }),
    } as unknown as BaseChatModel
    registerLlmPlugin({
      ...base, type: provider, family: provider, owns: candidate => candidate === fake,
      refine: ({ base: same }) => same, patchCache: undefined, patchSystem: undefined, isFatal: undefined,
    })

    return { fake, calls }
  }

  const quiet = async <T>(run: () => Promise<T>): Promise<T> => {
    const { level } = logConfig()
    configureLog({ level: 'silent' })
    try {
      return await run()
    } finally {
      configureLog({ level })
    }
  }

  test('OpenAI json_schema: `properties.required` is refused with the pointer, on attempt 0, fatally', async () => {
    const { fake, calls } = scripted(openAiPlugin, 'gpt-6-sol', '{"label":"a","required":true}')
    const llm = makeLlmModel({ model: fake, retries: 8 }, spectator)

    const failure = await quiet(() => llm.invoke('Label the shelf.', field('required') as unknown as JSONSchemaType<Shelf>, { action: 'spec' })
      .catch((error: unknown) => error))

    expect(failure).toBeInstanceOf(LlmMissconfiguredError)
    expect(String((failure as Error).message)).toContain('#/properties/required')
    expect(calls).toHaveLength(0)
  })

  test('the same schema with `mandatory` is asked and answered', async () => {
    const { fake, calls } = scripted(openAiPlugin, 'gpt-6-sol', '{"label":"top","mandatory":true}')
    const llm = makeLlmModel({ model: fake, retries: 2 }, spectator)

    expect(await llm.invoke('Label the shelf.', field('mandatory') as unknown as JSONSchemaType<Shelf>, { action: 'spec' }))
      .toEqual({ label: 'top', mandatory: true })
    expect(calls).toHaveLength(1)
  })

  test('request() refuses the same way; a tool-calling rung is not refused', async () => {
    const openAi = scripted(openAiPlugin, 'gpt-6-sol', '{}')
    const failure = await quiet(() => makeLlmModel({ model: openAi.fake, retries: 8 }, spectator)
      .request('Label the shelf.', field('required') as unknown as JSONSchemaType<Shelf>, { action: 'spec' })
      .catch((error: unknown) => error))
    expect(failure).toBeInstanceOf(LlmMissconfiguredError)
    expect(openAi.calls).toHaveLength(0)

    const viaTools = scripted(openAiPlugin, 'gpt-6-sol', '{"label":"low","required":false}', { structuredOutput: false })
    expect(await makeLlmModel({ model: viaTools.fake, retries: 2 }, spectator)
      .invoke('Label the shelf.', field('required') as unknown as JSONSchemaType<Shelf>, { action: 'spec' }))
      .toEqual({ label: 'low', required: false })
  })
})
