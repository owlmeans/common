import { describe, expect, test } from 'bun:test'

import { isTransientTransportError, recoverLongPoll } from '../src/api/remote.js'

describe('viable-sdk — remote transport recovery', () => {
  test('recognises a reset on the error or its fetch cause', () => {
    const direct = Object.assign(new Error('socket closed'), { code: 'ECONNRESET' })
    const nested = new TypeError('fetch failed', { cause: direct })

    expect(isTransientTransportError(direct)).toBe(true)
    expect(isTransientTransportError(nested)).toBe(true)
    expect(isTransientTransportError(new Error('project was refused'))).toBe(false)
  })

  test('answers a dropped long poll from one immediate durable snapshot', async () => {
    const calls: string[] = []
    const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
    const result = await recoverLongPoll(
      async () => { calls.push('poll'); throw reset },
      async () => { calls.push('snapshot'); return { status: 'running' } },
    )

    expect(result).toEqual({ status: 'running' })
    expect(calls).toEqual(['poll', 'snapshot'])
  })

  test('does not retry a platform refusal', async () => {
    let snapshots = 0
    const refusal = new Error('Forbidden')

    await expect(recoverLongPoll(
      async () => { throw refusal },
      async () => { snapshots++; return 'wrong' },
    )).rejects.toBe(refusal)
    expect(snapshots).toBe(0)
  })
})
