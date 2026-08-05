import { describe, expect, test } from 'bun:test'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import {
  coerceToSchema, LlmRetryExceededError, normalizeInput, parseJsonContent, registerFatalError,
  spectate, withRetry,
} from '@owlmeans/llm'
import { recordingSpectator } from './context.js'

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
})

describe('helpers/json — recovering JSON a model emitted as content', () => {
  test('parses plain JSON', () => {
    expect(parseJsonContent('{"a":1}')).toEqual({ a: 1 })
  })

  test('unwraps a markdown fence', () => {
    expect(parseJsonContent('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parseJsonContent('```\n[1,2]\n```')).toEqual([1, 2])
  })

  test('salvages an object from surrounding prose', () => {
    expect(parseJsonContent('Sure! Here it is: {"a":1} — hope that helps')).toEqual({ a: 1 })
  })

  test('salvages an array from surrounding prose', () => {
    expect(parseJsonContent('Result: ["x","y"] done')).toEqual(['x', 'y'])
  })

  test('reads structured content blocks', () => {
    expect(parseJsonContent([{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }])).toEqual({ a: 1 })
  })

  test('returns null when there is nothing parseable', () => {
    expect(parseJsonContent('no json here')).toBeNull()
    expect(parseJsonContent('')).toBeNull()
    expect(parseJsonContent(null)).toBeNull()
    expect(parseJsonContent(42)).toBeNull()
  })
})

describe('helpers/json — reconciling a model answer with its schema', () => {
  // Observed in the wild: a model fills an `array` field with the STRING "[]".
  test('parses stringified arrays and objects back', () => {
    const schema = {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string' } } },
    }
    expect(coerceToSchema({ files: '["a","b"]' }, schema)).toEqual({ files: ['a', 'b'] })
    expect(coerceToSchema({ files: '[]' }, schema)).toEqual({ files: [] })
  })

  test('coerces stringified scalars to their declared type', () => {
    const schema = {
      type: 'object',
      properties: { count: { type: 'integer' }, ok: { type: 'boolean' }, ratio: { type: 'number' } },
    }
    expect(coerceToSchema({ count: '7', ok: 'true', ratio: '0.5' }, schema))
      .toEqual({ count: 7, ok: true, ratio: 0.5 })
  })

  // A value that cannot be coerced is kept, so validation reports the real problem.
  test('keeps an uncoercible value untouched', () => {
    const schema = { type: 'object', properties: { count: { type: 'integer' } } }
    expect(coerceToSchema({ count: 'seven' }, schema)).toEqual({ count: 'seven' })
  })

  // Also observed: a `string[]` field filled with `[{ path: '…' }]`.
  test('unwraps a scalar the model over-wrapped in an object', () => {
    const schema = { type: 'array', items: { type: 'string' } }
    expect(coerceToSchema([{ path: 'src/a.ts' }, { value: 'src/b.ts' }], schema))
      .toEqual(['src/a.ts', 'src/b.ts'])
    expect(coerceToSchema([{ onlyOne: 'src/c.ts' }], schema)).toEqual(['src/c.ts'])
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
    expect(coerceToSchema({ items: [{ n: '1' }, { n: '2' }] }, schema))
      .toEqual({ items: [{ n: 1 }, { n: 2 }] })
  })

  test('leaves conforming values and unknown schemas alone', () => {
    expect(coerceToSchema({ a: 1 }, { type: 'object', properties: { a: { type: 'integer' } } })).toEqual({ a: 1 })
    expect(coerceToSchema('x', undefined)).toBe('x')
  })
})

describe('helpers/retry', () => {
  test('returns the first success and reports the attempt index', async () => {
    const attempts: number[] = []
    const result = await withRetry({ retries: 5 }, async i => {
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
      await withRetry({ retries: 3 }, async () => { throw failure })
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
    await expect(withRetry(
      { retries: 5, fatal: e => e === boom ? boom : null },
      async () => { calls += 1; throw boom }
    )).rejects.toThrow('unrecoverable')
    expect(calls).toBe(1)
  })

  // This is how a host registers "budget exhausted" so a model call stops retrying.
  test('a globally registered resolver aborts every retry loop', async () => {
    class SpecBudgetError extends Error { }
    registerFatalError(e => e instanceof SpecBudgetError ? e : null)

    let calls = 0
    await expect(withRetry({ retries: 5 }, async () => {
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
    expect(last.content).toEqual([{ id: '1', name: 'extract', args: { a: 1 } }] as unknown as string)
  })
})
