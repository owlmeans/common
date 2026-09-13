import { describe, expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import { ConnectOutOfCredits } from '../src/connect/errors.js'

describe('@owlmeans/viable-common — ConnectOutOfCredits', () => {
  test('carries its fields fresh, and survives a marshal/unmarshal round trip', () => {
    const url = 'https://vib-stage.owlmeans.org/?top-up=story'
    const fresh = new ConnectOutOfCredits(ConnectOutOfCredits.encode('story', 1, 0.4, url))

    expect(fresh.gate).toBe('story')
    expect(fresh.requiredUsd).toBe(1)
    expect(fresh.balanceUsd).toBe(0.4)
    expect(fresh.topUpUrl).toBe(url)

    const restored = ResilientError.ensure(fresh.marshal())

    expect(restored).toBeInstanceOf(ConnectOutOfCredits)
    expect(restored).toEqual(expect.objectContaining({
      gate: 'story', requiredUsd: 1, balanceUsd: 0.4, topUpUrl: url,
    }))
  })
})
