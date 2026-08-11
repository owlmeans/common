import { describe, expect, test } from 'bun:test'
import type { MessageFieldWithRole } from '@langchain/core/messages'
import { JSON_INSTRUCTION, NO_THINK_DIRECTIVE } from '../src/consts.js'
import { applyNoThink, ensureJsonMention } from '../src/utils/prompt.js'
import { toToolName, unwrapNamed } from '../src/utils/schema.js'
import { getChunkFinishReason, streamWithDeadline } from '../src/utils/stream.js'

/**
 * Internal utilities — deliberately not part of the package surface (`utils/` is
 * library-private; `helpers/` is what a consumer may use alongside a model), so they are
 * imported from source.
 */

describe('utils/prompt — JSON mention', () => {
  test('appends the instruction when nothing mentions JSON', () => {
    const msgs: MessageFieldWithRole[] = [{ role: 'user', content: 'Describe the project' }]
    ensureJsonMention(msgs)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.content).toBe(`Describe the project\n${JSON_INSTRUCTION}`)
  })

  test('leaves the prompt alone when JSON is already mentioned, in any casing', () => {
    const msgs: MessageFieldWithRole[] = [{ role: 'user', content: 'Answer as JSON please' }]
    ensureJsonMention(msgs)
    expect(msgs[0]!.content).toBe('Answer as JSON please')
  })

  test('finds the mention inside structured content blocks', () => {
    const msgs = [{ role: 'user', content: [{ type: 'text', text: 'reply in json' }] }] as unknown as MessageFieldWithRole[]
    ensureJsonMention(msgs)
    expect(msgs).toHaveLength(1)
  })

  test('pushes a new message when the last one cannot be appended to', () => {
    const msgs = [{ role: 'user', content: [{ type: 'text', text: 'look at this' }] }] as unknown as MessageFieldWithRole[]
    ensureJsonMention(msgs)
    expect(msgs).toHaveLength(2)
    expect(msgs[1]!.content).toBe(JSON_INSTRUCTION)
  })
})

describe('utils/prompt — thinking suppression', () => {
  test('injects the soft switch only when the config asks for it', () => {
    const off: MessageFieldWithRole[] = [{ role: 'user', content: 'hi' }]
    applyNoThink(off, undefined)
    expect(off[0]!.content).toBe('hi')

    const on: MessageFieldWithRole[] = [{ role: 'user', content: 'hi' }]
    applyNoThink(on, true)
    expect(on[0]!.content).toBe(`hi\n${NO_THINK_DIRECTIVE}`)
  })

  test('is idempotent', () => {
    const msgs: MessageFieldWithRole[] = [{ role: 'user', content: 'hi' }]
    applyNoThink(msgs, true)
    applyNoThink(msgs, true)
    expect(msgs[0]!.content).toBe(`hi\n${NO_THINK_DIRECTIVE}`)
  })
})

describe('utils/schema — tool naming and unwrapping', () => {
  test('sanitises a schema title into a provider-acceptable tool name', () => {
    expect(toToolName('User Story')).toBe('User_Story')
    expect(toToolName('spec.v2/final')).toBe('spec_v2_final')
    expect(toToolName('__weird__')).toBe('weird')
  })

  test('falls back to the default name when nothing usable is present', () => {
    expect(toToolName(undefined)).toBe('extract')
    expect(toToolName('!!!')).toBe('extract')
  })

  test('unwraps a named envelope, and passes anything else through', () => {
    expect(unwrapNamed({ spec: { a: 1 } }, 'spec')).toEqual({ a: 1 })
    expect(unwrapNamed({ a: 1 }, 'spec')).toEqual({ a: 1 })
    expect(unwrapNamed({ a: 1 }, undefined)).toEqual({ a: 1 })
    expect(unwrapNamed('plain' as unknown as object, 'spec')).toBe('plain' as unknown as object)
  })
})

describe('utils/stream — idle deadline and duplicate-final-chunk dedup', () => {
  const chunks = (...items: unknown[]): AsyncIterable<unknown> => ({
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item
    },
  })

  const collect = async (stream: AsyncGenerator<unknown>): Promise<unknown[]> => {
    const out: unknown[] = []
    for await (const chunk of stream) out.push(chunk)
    return out
  }

  test('yields every chunk of a well-behaved stream', async () => {
    const out = await collect(streamWithDeadline(async () => chunks({ a: 1 }, { a: 2 }), 1000))
    expect(out).toEqual([{ a: 1 }, { a: 2 }])
  })

  // Some providers send the final SSE data event twice; concatenating it doubles every
  // string field and corrupts accumulated tool-call arguments.
  test('stops at the first chunk carrying a finish_reason', async () => {
    const final = { response_metadata: { finish_reason: 'stop' } }
    const out = await collect(streamWithDeadline(async () => chunks({ a: 1 }, final, final), 1000))
    expect(out).toEqual([{ a: 1 }, final])
  })

  test('reads the finish reason out of a combined structured chunk too', () => {
    expect(getChunkFinishReason({ raw: { response_metadata: { finish_reason: 'length' } } })).toBe('length')
    expect(getChunkFinishReason({})).toBeUndefined()
  })

  test('an empty finish_reason does not end the stream early', async () => {
    const out = await collect(streamWithDeadline(
      async () => chunks({ response_metadata: { finish_reason: '' } }, { a: 2 }), 1000
    ))
    expect(out).toHaveLength(2)
  })

  test('a provider that accepts the request and then goes silent is aborted, not awaited forever', async () => {
    const stalled = (signal: AbortSignal): Promise<AsyncIterable<unknown>> => Promise.resolve({
      async *[Symbol.asyncIterator]() {
        yield { a: 1 }
        await new Promise<void>((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
      },
    })

    const started = Date.now()
    await expect(collect(streamWithDeadline(stalled, 60))).rejects.toThrow(/stream-stalled/)
    // The deadline is per-token, so the first chunk re-arms it: expect roughly one window.
    expect(Date.now() - started).toBeLessThan(2000)
  })

  test('an error from the provider itself is surfaced unchanged', async () => {
    const failing = async (): Promise<AsyncIterable<unknown>> => {
      throw new Error('401 unauthorized')
    }
    await expect(collect(streamWithDeadline(failing, 1000))).rejects.toThrow('401 unauthorized')
  })
})
