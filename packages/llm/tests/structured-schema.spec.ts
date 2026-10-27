import { configureLog, logConfig } from '@owlmeans/log'
import { describe, expect, test } from 'bun:test'
import { AIMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { JSONSchemaType } from 'ajv'
import { anthropicPlugin, LlmMissconfiguredError, makeLlmModel, OPENAI_HIDDEN_PROPERTY_NAMES, openAiPlugin, type LlmPlugin, type LlmSpectator, llmPluginRegistry, retryHelper } from '@owlmeans/llm'
import { schemaUtils } from '../src/utils/schema.js'

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
    expect(schemaUtils.hiddenPropertyNames(field('required'), OPENAI_HIDDEN_PROPERTY_NAMES))
      .toEqual(['#/properties/required: a property named "required" is not shown to the model'])
    const nested = {
      type: 'object',
      properties: {
        tools: { type: 'array', items: { type: 'object', properties: { default: { type: 'string' } } } },
        spare: { anyOf: [{ type: 'object', properties: { format: { type: 'string' } } }, { type: 'null' }] },
      },
      $defs: { bin: { type: 'object', properties: { pattern: { type: 'string' } } } },
    }
    expect(schemaUtils.hiddenPropertyNames(nested, OPENAI_HIDDEN_PROPERTY_NAMES).map(line => line.split(':')[0])).toEqual([
      '#/properties/tools/items/properties/default',
      '#/properties/spare/anyOf/0/properties/format',
      '#/$defs/bin/properties/pattern',
    ])
  })

  test('the same schema with another name, and keywords in keyword position, pass', () => {
    expect(schemaUtils.hiddenPropertyNames(field('mandatory'), OPENAI_HIDDEN_PROPERTY_NAMES)).toEqual([])
    for (const shown of ['type', 'properties', 'items', 'enum', 'const', 'description', 'title', 'nullable', 'anyOf', 'oneOf']) {
      expect([shown, schemaUtils.hiddenPropertyNames(field(shown), OPENAI_HIDDEN_PROPERTY_NAMES)]).toEqual([shown, []])
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
    expect(retryHelper.isFatalError(error)).toBe(error)
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
    llmPluginRegistry.register({
      ...base, type: provider, family: provider, owns: candidate => candidate === fake,
      refine: ({ base: same }) => same, patchPrompt: undefined, loopCache: undefined, cacheDialect: undefined,
      isFatal: undefined,
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

describe('@owlmeans/llm — schemaPlacement: tail keeps one prefix across schemas', () => {
  let seq = 0
  interface Shelf { label: string }
  const spectator = { log: async () => undefined } as unknown as LlmSpectator
  const other = {
    title: 'bin', type: 'object', properties: { size: { type: 'number' } }, required: ['size'], additionalProperties: false,
  }

  /** Records every request — messages, call options, and whether a tool was bound. */
  const recording = (base: LlmPlugin, model: string, reply: string) => {
    const calls: Array<{ msgs: Array<{ role?: string, content: unknown }>, options: Record<string, unknown>, tools: boolean }> = []
    const provider = `spec-tail-${seq++}`
    const answer = (tools: boolean) => async (msgs: unknown, options: Record<string, unknown>) => {
      calls.push({ msgs: msgs as Array<{ role?: string, content: unknown }>, options, tools })
      return (async function* () { yield new AIMessageChunk({ content: reply }) })()
    }
    const fake = {
      getName: () => 'fake',
      lc_kwargs: { model },
      metadata: { config: { alias: 'spec', provider, model } },
      stream: answer(false),
      bindTools: () => ({ stream: answer(true) }),
    } as unknown as BaseChatModel
    llmPluginRegistry.register({
      ...base, type: provider, family: provider, owns: candidate => candidate === fake,
      refine: ({ base: same }) => same, patchPrompt: undefined, loopCache: undefined, cacheDialect: undefined,
      isFatal: undefined,
    })

    return { fake, calls }
  }

  const textOf = (content: unknown): string => typeof content === 'string'
    ? content
    : (content as Array<{ text?: string }>).map(part => part.text ?? '').join('\n')

  test('OpenAI: JSON mode, no tool, the schema in the final message', async () => {
    const { fake, calls } = recording(openAiPlugin, 'gpt-6-sol', '{"label":"top","mandatory":true}')
    const llm = makeLlmModel({ model: fake, retries: 2 }, spectator)

    expect(await llm.invoke('Label the shelf.', field('mandatory') as unknown as JSONSchemaType<Shelf>, {
      action: 'spec', schemaPlacement: 'tail',
    })).toEqual({ label: 'top', mandatory: true })
    expect(calls).toHaveLength(1)
    expect(calls[0].tools).toBe(false)
    expect(calls[0].options.response_format).toEqual({ type: 'json_object' })
    const last = textOf(calls[0].msgs[calls[0].msgs.length - 1].content)
    expect(last).toContain('Answer with ONLY one JSON object')
    expect(last).toContain('"mandatory"')
  })

  test('Anthropic: no tool and no response format; the answer is parsed from the text', async () => {
    const { fake, calls } = recording(anthropicPlugin, 'claude-sonnet-5-5', '{"size":3}')
    const llm = makeLlmModel({ model: fake, retries: 2 }, spectator)

    expect(await llm.invoke('Size the bin.', other as unknown as JSONSchemaType<{ size: number }>, {
      action: 'spec', schemaPlacement: 'tail',
    })).toEqual({ size: 3 })
    expect(calls[0].tools).toBe(false)
    expect(calls[0].options.response_format).toBeUndefined()
  })

  test('two schemas on one conversation differ only in the final message', async () => {
    const shelf = recording(openAiPlugin, 'gpt-6-sol', '{"label":"x","kind":true}')
    const bin = recording(openAiPlugin, 'gpt-6-sol', '{"size":1}')
    const conversation = ['The storeroom has shelves and bins.', 'Answer about one item.']
    await makeLlmModel({ model: shelf.fake, retries: 1 }, spectator)
      .invoke([...conversation], field('kind') as unknown as JSONSchemaType<Shelf>, { action: 'spec', schemaPlacement: 'tail' })
    await makeLlmModel({ model: bin.fake, retries: 1 }, spectator)
      .invoke([...conversation], other as unknown as JSONSchemaType<{ size: number }>, { action: 'spec', schemaPlacement: 'tail' })

    const a = shelf.calls[0].msgs
    const b = bin.calls[0].msgs
    expect(a.length).toBe(b.length)
    expect(a.slice(0, -1).map(msg => textOf(msg.content))).toEqual(b.slice(0, -1).map(msg => textOf(msg.content)))
    expect(shelf.calls[0].options.response_format).toEqual(bin.calls[0].options.response_format)
  })

  test('a property OpenAI would hide in json_schema is shown as text, so it is not refused', async () => {
    const { fake } = recording(openAiPlugin, 'gpt-6-sol', '{"label":"a","required":true}')
    expect(await makeLlmModel({ model: fake, retries: 2 }, spectator)
      .invoke('Label the shelf.', field('required') as unknown as JSONSchemaType<Shelf>, { action: 'spec', schemaPlacement: 'tail' }))
      .toEqual({ label: 'a', required: true })
  })
})
