import { describe, test, expect } from 'bun:test'
import { queueBridgeHelper } from '../src/bridge.js'
import { EnvelopeExpired } from '../src/errors.js'
import type { JobEnvelope } from '../src/types.js'

const envelope = (enqueuedAt?: string): JobEnvelope => ({
  alias: 'story:code', params: { id: '7' }, body: { prompt: 'x' }, headers: {}, query: {}, enqueuedAt
})

describe('rebuilding the request', () => {
  test('the envelope becomes an ordinary request', () => {
    const request = queueBridgeHelper.requestOf(envelope(), '/story/:id/code')

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
    const request = queueBridgeHelper.requestOf({ alias: 'story:code' }, '/x')

    expect(request.params).toEqual({})
    expect(request.headers).toEqual({})
    expect(request.query).toEqual({})
  })
})

describe('the delivery a rebuilt request names', () => {
  /**
   * The broker hands a job back after a stall or a failed attempt. The signed request's nonce is
   * bound to the job's identity, so a redelivery of THIS job is not a replay — which needs the
   * identity on the request, stable across attempts, beside the attempt itself.
   */
  test('a request rebuilt from a job carries its queue-scoped id and its attempt', () => {
    const job = { id: 'story-develop-7-2', name: 'story:code', queue: 'agent-ops', attempt: 2, touch: async () => {} }
    const request = queueBridgeHelper.requestOf(envelope(), '/x', undefined, job)

    expect(request.delivery).toEqual({ id: 'agent-ops:story-develop-7-2', attempt: 2 })
    expect(queueBridgeHelper.queueJobOf(request)).toBe(job)
  })

  test('the broker\'s enqueue time and the queue\'s window ride the delivery — the window only where one is set', () => {
    const job = { id: 'j', name: 'story:code', queue: 'agent-ops', attempt: 1, enqueuedAt: 1_700_000_000_000, touch: async () => {} }
    const windowed = { cfg: { queue: { envelopeTtl: 86_400 } } } as never
    const unbounded = { cfg: { queue: {} } } as never
    const forged = { ...envelope(new Date(0).toISOString()), delivery: { enqueuedAt: 0, maxAge: 1 } } as JobEnvelope

    expect(queueBridgeHelper.requestOf(envelope(), '/x', windowed, job).delivery)
      .toEqual({ id: 'agent-ops:j', attempt: 1, enqueuedAt: 1_700_000_000_000, maxAge: 86_400_000 })
    expect(queueBridgeHelper.requestOf(envelope(), '/x', unbounded, job).delivery)
      .toEqual({ id: 'agent-ops:j', attempt: 1, enqueuedAt: 1_700_000_000_000 })
    // The envelope's own `enqueuedAt` is the producer's data: it never becomes the delivery's.
    expect(queueBridgeHelper.requestOf(forged, '/x', windowed, { ...job, enqueuedAt: undefined }).delivery)
      .toEqual({ id: 'agent-ops:j', attempt: 1, maxAge: 86_400_000 })
  })

  test('without a job nothing is named — and the envelope cannot supply one', () => {
    const forged = { ...envelope(), delivery: { id: 'agent-ops:other', attempt: 2 } } as JobEnvelope

    expect(queueBridgeHelper.requestOf(envelope(), '/x').delivery).toBeUndefined()
    expect(queueBridgeHelper.requestOf(forged, '/x').delivery).toBeUndefined()
  })
})

describe('envelope freshness', () => {
  test('a fresh envelope passes', () => {
    expect(() => queueBridgeHelper.assertFresh(envelope(new Date().toISOString()), 60)).not.toThrow()
  })

  test('an envelope older than the window is refused', () => {
    const old = new Date(Date.now() - 120_000).toISOString()

    expect(() => queueBridgeHelper.assertFresh(envelope(old), 60)).toThrow(EnvelopeExpired)
  })

  /**
   * The window is judged from when the job was ENQUEUED. A job that waited behind a long backlog
   * was legitimate when it was produced, and judging it on pickup would reject exactly the work a
   * busy queue delayed — so a generous window has to keep it.
   */
  test('a long wait in the queue is not what expiry is for', () => {
    const enqueued = new Date(Date.now() - 3600_000).toISOString()

    expect(() => queueBridgeHelper.assertFresh(envelope(enqueued), 86_400)).not.toThrow()
  })

  test('no configured window means no check', () => {
    const ancient = new Date(0).toISOString()

    expect(() => queueBridgeHelper.assertFresh(envelope(ancient), undefined)).not.toThrow()
  })

  test('an envelope without a timestamp is not judged', () => {
    expect(() => queueBridgeHelper.assertFresh(envelope(undefined), 60)).not.toThrow()
  })
})
