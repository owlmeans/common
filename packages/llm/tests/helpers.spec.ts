import { describe, expect, test } from 'bun:test'
import { configureLog, logConfig } from '@owlmeans/log'
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
  anthropicPlugin, cacheHelper, LlmRetryExceededError, llmPluginRegistry, makeLlmModel, makePromptService,
  normalizeInput, spectate, jsonHelper, retryHelper,
} from '@owlmeans/llm'
import { recordingSpectator, SpecificationSchema } from './context.js'

describe('helpers/messages — input normalization', () => {
  test('lifts a bare string into a user message', () => {
    expect(normalizeInput('hello')).toEqual([{ role: 'user', content: 'hello' }])
  })

  test('wraps a single message and passes an array through', () => {
    const msg = { role: 'system' as const, content: 'be terse' }
    expect(normalizeInput(msg)).toEqual([msg])
    expect(normalizeInput([msg, 'hi'])).toEqual([msg, { role: 'user', content: 'hi' }])
  })

  test('produces a fresh array the model may mutate without touching the caller', () => {
    const input = [{ role: 'user' as const, content: 'hi' }]
    const normalized = normalizeInput(input)
    normalized.push({ role: 'user', content: 'extra' })
    expect(input).toHaveLength(1)
  })

  // A caller carries its conversation across calls; the model prepares copies — same class, own
  // content array — so nothing it appends or marks ever reaches the caller's objects.
  test('copies every message, keeping its class, so the caller\'s objects are never edited', () => {
    const human = new HumanMessage({ content: [{ type: 'text', text: 'look' }] })
    const plain = { role: 'user' as const, content: 'hi' }
    const [copy, other] = normalizeInput([human, plain])

    expect(copy).not.toBe(human)
    expect(copy).toBeInstanceOf(HumanMessage)
    expect(other).not.toBe(plain)
    ;(copy!.content as unknown[]).push({ type: 'text', text: 'appended' })
    other!.content = 'changed'
    expect(human.content).toEqual([{ type: 'text', text: 'look' }])
    expect(plain.content).toBe('hi')
  })
})

describe('the model never edits what the caller sent', () => {
  let seq = 0
  /** A claude stand-in resolved through a copy of the real Anthropic plugin — no client rebuild. */
  const claude = (reply: AIMessageChunk, sent: unknown[][]): BaseChatModel => {
    const provider = `spec-helpers-${seq++}`
    const fake = {
      getName: () => 'fake', lc_kwargs: { model: 'claude-haiku-4-5' }, modelName: 'claude-haiku-4-5',
      metadata: { config: { alias: 'spec', provider, model: 'claude-haiku-4-5', cacheMinTokens: 1 } },
      stream: async (messages: unknown[]) => {
        sent.push(messages)
        return (async function* () { yield reply })()
      },
    } as unknown as BaseChatModel
    llmPluginRegistry.register({
      ...anthropicPlugin, type: provider, family: provider, owns: candidate => candidate === fake, refine: ({ base }) => base,
    })
    return fake
  }

  test('a stable lead, a tail and the directives are placed on copies', async () => {
    const svc = makePromptService({ skills: [{ alias: 'a', body: 'A' }, { alias: 'percall', body: 'P' }] }, `spec-helpers-prompt-${seq++}`)
    const caller = [new SystemMessage('caller system'), new HumanMessage('stable lead'), new HumanMessage('the task')]
    const sent: unknown[][] = []
    const llm = makeLlmModel({
      model: claude(new AIMessageChunk({ content: 'ok' }), sent), purpose: { type: 't' },
      prompt: { role: 'R', skills: ['a'] }, prompts: () => svc,
    }, recordingSpectator())

    expect(await llm.ask(caller, { action: 'a', stable: 1, skills: ['percall'] })).toBe('ok')
    const [, , lead, task] = sent[0] as HumanMessage[]
    expect(lead!.content).toEqual([{ type: 'text', text: 'stable lead', cache_control: { type: 'ephemeral' } }])
    expect(lead).toBeInstanceOf(HumanMessage)
    expect(task!.content).toBe('the task\n\n## percall\n\nP')
    expect(caller.map(msg => msg.content)).toEqual(['caller system', 'stable lead', 'the task'])
  })
})

describe('helpers/json — recovering JSON a model emitted as content', () => {
  test('parses plain JSON', () => {
    expect(jsonHelper.parseJsonContent('{"a":1}')).toEqual({ a: 1 })
  })

  test('unwraps a markdown fence', () => {
    expect(jsonHelper.parseJsonContent('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(jsonHelper.parseJsonContent('```\n[1,2]\n```')).toEqual([1, 2])
  })

  test('salvages an object from surrounding prose', () => {
    expect(jsonHelper.parseJsonContent('Sure! Here it is: {"a":1} — hope that helps')).toEqual({ a: 1 })
  })

  test('salvages an array from surrounding prose', () => {
    expect(jsonHelper.parseJsonContent('Result: ["x","y"] done')).toEqual(['x', 'y'])
  })

  test('reads structured content blocks', () => {
    expect(jsonHelper.parseJsonContent([{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }])).toEqual({ a: 1 })
  })

  test('returns null when there is nothing parseable', () => {
    expect(jsonHelper.parseJsonContent('no json here')).toBeNull()
    expect(jsonHelper.parseJsonContent('')).toBeNull()
    expect(jsonHelper.parseJsonContent(null)).toBeNull()
    expect(jsonHelper.parseJsonContent(42)).toBeNull()
  })
})

describe('helpers/json — reconciling a model answer with its schema', () => {
  // Observed in the wild: a model fills an `array` field with the STRING "[]".
  test('parses stringified arrays and objects back', () => {
    const schema = {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string' } } },
    }
    expect(jsonHelper.coerceToSchema({ files: '["a","b"]' }, schema)).toEqual({ files: ['a', 'b'] })
    expect(jsonHelper.coerceToSchema({ files: '[]' }, schema)).toEqual({ files: [] })
  })

  test('coerces stringified scalars to their declared type', () => {
    const schema = {
      type: 'object',
      properties: { count: { type: 'integer' }, ok: { type: 'boolean' }, ratio: { type: 'number' } },
    }
    expect(jsonHelper.coerceToSchema({ count: '7', ok: 'true', ratio: '0.5' }, schema))
      .toEqual({ count: 7, ok: true, ratio: 0.5 })
  })

  // A value that cannot be coerced is kept, so validation reports the real problem.
  test('keeps an uncoercible value untouched', () => {
    const schema = { type: 'object', properties: { count: { type: 'integer' } } }
    expect(jsonHelper.coerceToSchema({ count: 'seven' }, schema)).toEqual({ count: 'seven' })
  })

  // Also observed: a `string[]` field filled with `[{ path: '…' }]`.
  test('unwraps a scalar the model over-wrapped in an object', () => {
    const schema = { type: 'array', items: { type: 'string' } }
    expect(jsonHelper.coerceToSchema([{ path: 'src/a.ts' }, { value: 'src/b.ts' }], schema))
      .toEqual(['src/a.ts', 'src/b.ts'])
    expect(jsonHelper.coerceToSchema([{ onlyOne: 'src/c.ts' }], schema)).toEqual(['src/c.ts'])
  })

  test('walks nested structures', () => {
    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'object', properties: { n: { type: 'integer' } } },
        },
      },
    }
    expect(jsonHelper.coerceToSchema({ items: [{ n: '1' }, { n: '2' }] }, schema))
      .toEqual({ items: [{ n: 1 }, { n: 2 }] })
  })

  test('leaves conforming values and unknown schemas alone', () => {
    expect(jsonHelper.coerceToSchema({ a: 1 }, { type: 'object', properties: { a: { type: 'integer' } } })).toEqual({ a: 1 })
    expect(jsonHelper.coerceToSchema('x', undefined)).toBe('x')
  })
})

describe('helpers/retry', () => {
  test('returns the first success and reports the attempt index', async () => {
    const attempts: number[] = []
    const result = await retryHelper.withRetry({ retries: 5 }, async i => {
      attempts.push(i)
      if (i < 2) throw new Error('transient')
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(attempts).toEqual([0, 1, 2])
  })

  test('exhausting the budget throws, carrying the last error and attempt', async () => {
    const failure = new Error('always')
    let thrown: unknown
    try {
      await retryHelper.withRetry({ retries: 3 }, async () => { throw failure })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(LlmRetryExceededError)
    expect((thrown as LlmRetryExceededError).cause).toBe(failure)
    expect((thrown as LlmRetryExceededError).attempt).toBe(2)
  })

  test('a per-call fatal predicate aborts immediately', async () => {
    let calls = 0
    const boom = new Error('unrecoverable')
    await expect(retryHelper.withRetry({ retries: 5, fatal: e => e === boom ? boom : null }, async () => { calls += 1; throw boom })).rejects.toThrow('unrecoverable')
    expect(calls).toBe(1)
  })

  // This is how a host registers "budget exhausted" so a model call stops retrying.
  test('a globally registered resolver aborts every retry loop', async () => {
    class SpecBudgetError extends Error { }
    retryHelper.registerFatalError(e => e instanceof SpecBudgetError ? e : null)

    let calls = 0
    await expect(retryHelper.withRetry({ retries: 5 }, async () => {
      calls += 1
      throw new SpecBudgetError('out of budget')
    })).rejects.toThrow('out of budget')
    expect(calls).toBe(1)
  })
})

describe('helpers/spectate', () => {
  test('logs every prompt message plus the completion, in order', async () => {
    const spectator = recordingSpectator()
    await spectate(spectator, 'ask')(
      [new HumanMessage('question'), { role: 'system', content: 'be terse' }, 'plain'],
      new AIMessage('answer'), 'test-action', 2, 1000,
    )

    expect(spectator.entries).toHaveLength(1)
    const entry = spectator.entries[0]!
    expect(entry.action).toBe('test-action')
    expect(entry.retries).toBe(2)
    expect(entry.startedAt).toBe(1000)
    expect(entry.messages).toHaveLength(4)
    expect(entry.messages.map(m => m.callType)).toEqual(['ask', 'ask', 'ask', 'ask'])
    expect(entry.messages[1]!.type).toBe('system')
    expect(entry.messages[3]!.content).toBe('answer')
  })

  test('records tool-call arguments rather than the empty content of a tool completion', async () => {
    const spectator = recordingSpectator()
    const completion = new AIMessage({
      content: '',
      tool_calls: [{ id: '1', name: 'extract', args: { a: 1 } }],
    })
    await spectate(spectator, 'invoke')(['q'], completion, 'structured', 0)

    const last = spectator.entries[0]!.messages.at(-1)!
    expect(last.contentType).toBe('tool_call')
    // Serialized, not the raw array: a trace row is a string column, and handing it an object
    // is what stored `[object Object]` for every tool call until this was fixed.
    expect(typeof last.content).toBe('string')
    expect(JSON.parse(last.content)).toEqual([{ id: '1', name: 'extract', args: { a: 1 } }])
  })

  // The model that ANSWERED is billed — a fallback's, not the role's primary.
  test('names the answering model only when it is known', async () => {
    const spectator = recordingSpectator()
    await spectate(spectator, 'ask')(['q'], new AIMessage('a'), 'named', 0, 1, 'claude-sonnet-5-5')
    await spectate(spectator, 'ask')(['q'], new AIMessage('a'), 'unnamed', 0, 1)

    expect(spectator.entries[0]!.model).toBe('claude-sonnet-5-5')
    // The sink's own resolution stays when the caller could not tell.
    expect(spectator.entries[1]!.model).toBe('test-model')
  })

  // A response that arrived is billed even when nothing usable came of it.
  test('invoke logs a received response before it fails the attempt as a null result', async () => {
    const spectator = recordingSpectator()
    const fake = {
      getName: () => 'fake', lc_kwargs: { model: 'fake-model' },
      metadata: { config: { alias: 'spec', model: 'fake-model' } },
      bindTools: () => ({
        stream: async () => (async function* () { yield new AIMessageChunk({ content: 'no json here' }) })(),
      }),
    } as unknown as BaseChatModel
    const llm = makeLlmModel({ model: fake, purpose: { type: 't' }, retries: 1 }, spectator)

    const { level } = logConfig()
    configureLog({ level: 'silent' })
    try {
      await expect(llm.invoke('describe it', SpecificationSchema as never, { action: 'b6' })).rejects.toBeInstanceOf(LlmRetryExceededError)
    } finally {
      configureLog({ level })
    }
    expect(spectator.entries).toHaveLength(1)
    expect(spectator.entries[0]!.model).toBe('fake-model')
  })
})

describe('helpers/cache — the 1-hour write', () => {
  // langchain's chunk concatenation keeps only the token-detail keys it knows; Anthropic's
  // response metadata keeps the split, and is where it is read from.
  test('carries a non-zero 1h write from the provider usage onto the token details', () => {
    const message = new AIMessage({
      content: 'ok',
      usage_metadata: {
        input_tokens: 100, output_tokens: 5, total_tokens: 105, input_token_details: { cache_creation: 80, cache_read: 0 },
      },
      response_metadata: { usage: { cache_creation: { ephemeral_5m_input_tokens: 30, ephemeral_1h_input_tokens: 50 } } },
    })
    cacheHelper.withCacheTiers(message)

    expect((message.usage_metadata!.input_token_details as Record<string, number>).cache_creation_1h).toBe(50)
    expect(cacheHelper.readCacheUsage(message)).toEqual({ read: 0, creation: 80, creationLong: 50, input: 100, output: 5 })
  })

  test('adds nothing when no 1h write was reported', () => {
    const message = new AIMessage({
      content: 'ok',
      usage_metadata: { input_tokens: 10, output_tokens: 1, total_tokens: 11, input_token_details: { cache_creation: 8 } },
      response_metadata: { usage: { cache_creation: { ephemeral_5m_input_tokens: 8, ephemeral_1h_input_tokens: 0 } } },
    })
    cacheHelper.withCacheTiers(message)

    expect('cache_creation_1h' in message.usage_metadata!.input_token_details!).toBe(false)
    expect('creationLong' in cacheHelper.readCacheUsage(message)).toBe(false)
  })
})
