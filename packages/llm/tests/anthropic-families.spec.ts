import { configureLog, logConfig } from '@owlmeans/log'
import { describe, expect, test } from 'bun:test'
import type { ChatAnthropic } from '@langchain/anthropic'
import { AIMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { JSONSchemaType } from 'ajv'
import { ModelEffort, ModelProvider } from '@owlmeans/llm-common'
import {
  anthropicPlugin, anthropicSupportOf, effortSupportOf, makeLlmModel, registerLlmPlugin,
  rejectsForcedTool, ThinkingOff, thinkingOffFor,
} from '@owlmeans/llm'
import type { LlmPlugin, LlmSpectator, ModelConfig } from '@owlmeans/llm'
import { toolCallInstruction } from '../src/consts.js'
import { isStrictSchema } from '../src/utils/schema.js'

/**
 * The Anthropic families differ in ways that are a 400, not a preference: the off switch for
 * thinking, the effort allowed beside it, and whether a pinned `tool_choice` is accepted. Every
 * shape below is read off the request langchain would send (`invocationParams`), offline.
 */

const build = (config: Partial<ModelConfig>) => anthropicPlugin.build({
  alias: 'spec', secret: 'sk-test', callbacks: [],
  config: { alias: 'spec', provider: ModelProvider.Anthropic, ...config } as ModelConfig,
}) as ChatAnthropic

type Wire = { thinking?: { type: string }, output_config?: { effort?: string }, tool_choice?: unknown, tools?: Array<Record<string, unknown>> }

const TALLY = {
  type: 'object',
  properties: { title: { type: 'string' }, count: { type: 'integer' } },
  required: ['title', 'count'],
  additionalProperties: false,
}

/** The request body for one structured call, built the way `streamStructured` binds the tool. */
const wireOf = (model: ChatAnthropic, config: Partial<ModelConfig>, schema: unknown = TALLY): Wire => {
  const strict = anthropicPlugin.strictTool?.(config, schema) === true
  return model.invocationParams({
    tools: [{ type: 'function', function: { name: 'tally', description: '', parameters: schema, ...(strict ? { strict } : {}) } }],
    tool_choice: anthropicPlugin.toolChoice('tally', config),
  } as never) as unknown as Wire
}

describe('@owlmeans/llm — anthropic thinking off switch per family', () => {
  const cases: Array<[string, ThinkingOff | undefined]> = [
    ['claude-sonnet-5', ThinkingOff.Disabled],
    ['claude-sonnet-5-5', ThinkingOff.BetweenTools],
    ['claude-opus-5', ThinkingOff.Disabled],
    ['claude-opus-4-8', ThinkingOff.Disabled],
    ['claude-opus-5-5', undefined],
    ['claude-fable-5', undefined],
    ['claude-fable-5-1', undefined],
    ['claude-mythos-5-1', undefined],
    ['claude-haiku-4-5', undefined],
  ]

  test('disableThinking sends the model\'s own off switch, or none where every switch is a 400', () => {
    for (const [model, off] of cases) {
      const wire = wireOf(build({ model, disableThinking: true }), { model })
      expect([model, wire.thinking]).toEqual([model, off != null ? { type: off } : undefined])
      expect([model, thinkingOffFor({ model, disableThinking: true })]).toEqual([model, off])
    }
  })

  test('without the flag no thinking field is sent to any family', () => {
    for (const [model] of cases) {
      expect([model, wireOf(build({ model }), { model }).thinking]).toEqual([model, undefined])
    }
  })

  test('between_tools goes on the wire alone — no display, budget or binding beside it', () => {
    expect(wireOf(build({ model: 'claude-sonnet-5-5', disableThinking: true }), {}).thinking)
      .toEqual({ type: 'between_tools' })
  })

  test('refine keeps the family\'s switch on every attempt', () => {
    for (const model of ['claude-sonnet-5', 'claude-sonnet-5-5']) {
      const base = build({ model, disableThinking: true })
      const refined = anthropicPlugin.refine({ base, attempt: 2, rungAttempt: 2, maxOutputCap: 64000 }) as ChatAnthropic
      expect([model, wireOf(refined, { model }).thinking]).toEqual([model, wireOf(base, { model }).thinking])
    }
  })
})

describe('@owlmeans/llm — anthropic effort beside the off switch', () => {
  // `between_tools` is accepted at low, medium and high; xhigh or max beside it is a 400.
  test('Sonnet 5.5 with thinking off clamps a requested xhigh to high, and never climbs past it', () => {
    const base = build({ model: 'claude-sonnet-5-5', disableThinking: true, effort: ModelEffort.XHigh })
    expect(wireOf(base, {}).output_config).toEqual({ effort: 'high' })

    const climbed = anthropicPlugin.refine({ base, attempt: 2, rungAttempt: 2, maxOutputCap: 64000 }) as ChatAnthropic
    expect(wireOf(climbed, {}).output_config).toEqual({ effort: 'high' })
    expect(effortSupportOf({ provider: ModelProvider.Anthropic, model: 'claude-sonnet-5-5', disableThinking: true })?.levels)
      .toEqual([ModelEffort.Low, ModelEffort.Medium, ModelEffort.High])
  })

  test('with thinking on every level is open, and the default stays high', () => {
    const on = build({ model: 'claude-sonnet-5-5', effort: ModelEffort.XHigh })
    expect(wireOf(on, {}).output_config).toEqual({ effort: 'xhigh' })
    expect(effortSupportOf({ provider: ModelProvider.Anthropic, model: 'claude-sonnet-5-5' })?.default)
      .toBe(ModelEffort.High)
  })

  // Nothing is sent to an always-thinking model, so nothing caps its effort either.
  test('an always-thinking model keeps every level under disableThinking', () => {
    const wire = wireOf(build({ model: 'claude-opus-5-5', disableThinking: true, effort: ModelEffort.Max }), {})
    expect(wire.output_config).toEqual({ effort: 'max' })
    expect(wire.thinking).toBeUndefined()
  })

  // langchain checks its own unsent `thinking: disabled` default against the effort: without the
  // alignment an Opus 5 call at xhigh threw locally before any request left.
  test('Opus 5 and 5.5 at xhigh or max build a request, with no thinking field on it', () => {
    for (const model of ['claude-opus-5', 'claude-opus-5-5']) {
      for (const effort of [ModelEffort.XHigh, ModelEffort.Max]) {
        const base = build({ model, effort })
        expect([model, effort, wireOf(base, {}).output_config]).toEqual([model, effort, { effort }])
        expect(wireOf(base, {}).thinking).toBeUndefined()
        const refined = anthropicPlugin.refine({ base, attempt: 1, rungAttempt: 1, maxOutputCap: 64000 }) as ChatAnthropic
        expect(wireOf(refined, {}).thinking).toBeUndefined()
      }
    }
  })

  test('Sonnet 5 is unchanged: disabled, every level', () => {
    const wire = wireOf(build({ model: 'claude-sonnet-5', disableThinking: true, effort: ModelEffort.XHigh }), {})
    expect(wire.thinking).toEqual({ type: 'disabled' })
    expect(wire.output_config).toEqual({ effort: 'xhigh' })
  })
})

describe('@owlmeans/llm — anthropic structured output per family', () => {
  const refusing = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-mythos-5-1']
  const pinning = ['claude-sonnet-5', 'claude-opus-5', 'claude-fable-5', 'claude-haiku-4-5', undefined]

  test('a model that refuses a pinned tool is asked with auto and a strict tool', () => {
    for (const model of refusing) {
      const wire = wireOf(build({ model }), { model })
      expect([model, wire.tool_choice]).toEqual([model, { type: 'auto' }])
      expect([model, wire.tools?.[0]?.strict]).toEqual([model, true])
      expect([model, anthropicPlugin.pinsTool?.({ model })]).toEqual([model, false])
      expect(rejectsForcedTool(model)).toBe(true)
    }
  })

  test('every other model keeps the pinned tool and no strict flag', () => {
    for (const model of pinning) {
      const wire = wireOf(build({ model }), { model })
      expect([model, wire.tool_choice]).toEqual([model, { type: 'tool', name: 'tally' }])
      expect([model, wire.tools?.[0]?.strict]).toEqual([model, undefined])
      expect([model, anthropicPlugin.pinsTool?.({ model })]).toEqual([model, true])
    }
  })

  test('a schema outside the strict subset goes unstrict rather than earn a 400', () => {
    const loose = { type: 'object', properties: { title: { type: 'string', minLength: 3 } }, required: ['title'] }
    expect(wireOf(build({ model: 'claude-sonnet-5-5' }), { model: 'claude-sonnet-5-5' }, loose).tools?.[0]?.strict)
      .toBeUndefined()
  })
})

describe('@owlmeans/llm — the strict schema subset', () => {
  test('a closed schema of basic types, formats, enums and small minItems is strict', () => {
    expect(isStrictSchema(TALLY)).toBe(true)
    expect(isStrictSchema({
      type: 'object',
      properties: {
        at: { type: 'string', format: 'date-time' },
        kind: { type: 'string', enum: ['a', 'b', null] },
        tags: { type: 'array', minItems: 1, items: { type: 'string' } },
        either: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        nested: { type: 'object', properties: { ok: { type: 'boolean' } }, additionalProperties: false },
      },
      required: ['at'],
      additionalProperties: false,
    })).toBe(true)
  })

  test('anything outside it is not', () => {
    const closed = (property: unknown) => ({
      type: 'object', properties: { x: property }, required: ['x'], additionalProperties: false,
    })
    for (const bad of [
      { type: 'object', properties: { x: { type: 'string' } } },
      closed({ type: 'string', minLength: 1 }),
      closed({ type: 'string', pattern: '^a' }),
      closed({ type: 'number', minimum: 0 }),
      closed({ type: 'string', nullable: true }),
      closed({ type: 'string', format: 'phone' }),
      closed({ type: 'array', minItems: 2, items: { type: 'string' } }),
      closed({ enum: [{ a: 1 }] }),
      closed({ $ref: '#/$defs/x' }),
      closed({ type: 'object', properties: {}, additionalProperties: true }),
      'not a schema',
    ]) {
      expect([bad, isStrictSchema(bad)]).toEqual([bad, false])
    }
  })
})

describe('@owlmeans/llm — anthropic cache minimum per family', () => {
  // About 600 tokens: above the 5 family's 512-token minimum, below Sonnet 5's 1024.
  const prefix = 'x'.repeat(600 * 4)
  const msgs = () => [
    { role: 'user' as const, content: prefix },
    { role: 'user' as const, content: 'the per-call payload' },
  ]

  test('a Sonnet 5.5 prefix of ~600 tokens is marked, a Sonnet 5 one is not', () => {
    expect(anthropicPlugin.patchCache?.(msgs(), { model: build({ model: 'claude-sonnet-5-5' }), useCache: true, cacheMax: 4 }))
      .toBe(true)
    expect(anthropicPlugin.patchCache?.(msgs(), { model: build({ model: 'claude-sonnet-5' }), useCache: true, cacheMax: 4 }))
      .toBe(false)
    expect(anthropicSupportOf('claude-sonnet-5-5')?.cacheMinTokens).toBe(512)
  })

  test('a preset\'s own cacheMinTokens still wins', () => {
    const model = build({ model: 'claude-sonnet-5-5', cacheMinTokens: 4096 })
    expect(anthropicPlugin.patchCache?.(msgs(), { model, useCache: true, cacheMax: 4 })).toBe(false)
  })
})

/**
 * The model layer against a stand-in for the provider boundary: the rung resolves a plugin that
 * IS the Anthropic plugin's structured-output behaviour, and the "model" records what it was
 * bound with and answers from a script.
 */
describe('@owlmeans/llm — structured output on a model that refuses a pinned tool', () => {
  let seq = 0

  interface Tally { title: string, count: number }
  const schema = { ...TALLY, title: 'tally' } as unknown as JSONSchemaType<Tally>

  const scripted = (model: string, replies: AIMessageChunk[]) => {
    const calls: Array<{ tools: Array<{ function: Record<string, unknown> }>, choice: unknown, last: unknown }> = []
    const provider = `spec-anthropic-${seq++}`
    const fake = {
      getName: () => 'fake-anthropic',
      lc_kwargs: { model },
      metadata: { config: { alias: 'spec', provider, model } },
      bindTools: (tools: Array<{ function: Record<string, unknown> }>, kwargs: { tool_choice: unknown }) => ({
        stream: async (msgs: Array<{ content: unknown }>) => {
          calls.push({ tools, choice: kwargs.tool_choice, last: msgs[msgs.length - 1]?.content })
          const reply = replies.shift()!
          return (async function* () { yield reply })()
        },
      }),
    } as unknown as BaseChatModel
    const plugin: LlmPlugin = {
      ...anthropicPlugin,
      type: provider,
      family: provider,
      owns: candidate => candidate === fake,
      refine: ({ base }) => base,
      patchCache: undefined,
      patchSystem: undefined,
      isFatal: undefined,
    }
    registerLlmPlugin(plugin)

    return { fake, calls }
  }

  const spectator = { log: async () => undefined } as unknown as LlmSpectator
  const quiet = async <T>(run: () => Promise<T>): Promise<T> => {
    const { level } = logConfig()
    configureLog({ level: 'silent' })
    try {
      return await run()
    } finally {
      configureLog({ level })
    }
  }

  const toolCall = (args: Tally) => new AIMessageChunk({
    content: '', tool_call_chunks: [{ name: 'tally', args: JSON.stringify(args), id: 'call-1', index: 0 }],
  })

  test('a text-only reply is a failed attempt that retries; the tool call is the answer', async () => {
    const { fake, calls } = scripted('claude-sonnet-5-5', [
      new AIMessageChunk({ content: 'There are three hammers on the shelf.' }),
      toolCall({ title: 'hammers', count: 3 }),
    ])
    const llm = makeLlmModel({ model: fake, retries: 3 }, spectator)

    const result = await quiet(() => llm.invoke('Count the hammers.', schema, { action: 'spec' }))

    expect(result).toEqual({ title: 'hammers', count: 3 })
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.choice).toEqual({ type: 'auto' })
      expect(call.tools[0]!.function.strict).toBe(true)
      expect(String(call.last)).toContain(toolCallInstruction('tally'))
    }
  })

  test('request() takes the same path', async () => {
    const { fake, calls } = scripted('claude-opus-5-5', [
      new AIMessageChunk({ content: 'Sure — the count is 2.' }),
      toolCall({ title: 'saws', count: 2 }),
    ])
    const llm = makeLlmModel({ model: fake, retries: 3 }, spectator)

    const message = await quiet(() => llm.request('Count the saws.', schema, { action: 'spec' }))

    expect(JSON.parse(`${message.content}`)).toEqual({ title: 'saws', count: 2 })
    expect(calls.map(call => call.choice)).toEqual([{ type: 'auto' }, { type: 'auto' }])
  })

  test('a model that takes the pin gets it, and no instruction', async () => {
    const { fake, calls } = scripted('claude-sonnet-5', [toolCall({ title: 'drills', count: 1 })])
    const llm = makeLlmModel({ model: fake, retries: 3 }, spectator)

    expect(await llm.invoke('Count the drills.', schema, { action: 'spec' })).toEqual({ title: 'drills', count: 1 })
    expect(calls[0]!.choice).toEqual({ type: 'tool', name: 'tally' })
    expect(calls[0]!.tools[0]!.function.strict).toBeUndefined()
    expect(String(calls[0]!.last)).not.toContain(toolCallInstruction('tally'))
  })
})
