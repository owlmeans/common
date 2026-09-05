import { describe, test, expect } from 'bun:test'
import { assertFresh, requestOf } from '../src/bridge.js'
import { EnvelopeExpired } from '../src/errors.js'
import type { JobEnvelope } from '../src/types.js'

const envelope = (enqueuedAt?: string): JobEnvelope => ({
  alias: 'story:code', params: { id: '7' }, body: { prompt: 'x' }, headers: {}, query: {}, enqueuedAt
})

describe('rebuilding the request', () => {
  test('the envelope becomes an ordinary request', () => {
    const request = requestOf(envelope(), '/story/:id/code')

    expect(request.alias).toBe('story:code')
    expect(request.params).toEqual({ id: '7' })
    expect(request.body).toEqual({ prompt: 'x' })
    expect(request.path).toBe('/story/:id/code')
  })

  /**
   * A producer may omit any of the optional parts. The handler on the far side reads them without
   * checking, so they have to arrive as empty containers rather than as undefined.
   */
  test('absent parts arrive as empty, never undefined', () => {
    const request = requestOf({ alias: 'story:code' }, '/x')

    expect(request.params).toEqual({})
    expect(request.headers).toEqual({})
    expect(request.query).toEqual({})
  })
})

describe('envelope freshness', () => {
  test('a fresh envelope passes', () => {
    expect(() => assertFresh(envelope(new Date().toISOString()), 60)).not.toThrow()
  })

  test('an envelope older than the window is refused', () => {
    const old = new Date(Date.now() - 120_000).toISOString()

    expect(() => assertFresh(envelope(old), 60)).toThrow(EnvelopeExpired)
  })

  /**
   * The window is judged from when the job was ENQUEUED. A job that waited behind a long backlog
   * was legitimate when it was produced, and judging it on pickup would reject exactly the work a
   * busy queue delayed — so a generous window has to keep it.
   */
  test('a long wait in the queue is not what expiry is for', () => {
    const enqueued = new Date(Date.now() - 3600_000).toISOString()

    expect(() => assertFresh(envelope(enqueued), 86_400)).not.toThrow()
  })

  test('no configured window means no check', () => {
    const ancient = new Date(0).toISOString()

    expect(() => assertFresh(envelope(ancient), undefined)).not.toThrow()
  })

  test('an envelope without a timestamp is not judged', () => {
    expect(() => assertFresh(envelope(undefined), 60)).not.toThrow()
  })
})
