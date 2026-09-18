import { describe, expect, test } from 'bun:test'
import { EstimateCache } from '../src/estimate-cache.js'

describe('EstimateCache', () => {
  test('caches a resolved value for its TTL, then refetches', async () => {
    const cache = new EstimateCache<number>()
    let calls = 0
    const factory = async () => { calls++; return calls }
    expect(await cache.load('k', 50, factory)).toBe(1)
    expect(await cache.load('k', 50, factory)).toBe(1)
    expect(calls).toBe(1)
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(await cache.load('k', 50, factory)).toBe(2)
  })

  test('shares one in-flight request between concurrent callers', async () => {
    const cache = new EstimateCache<number>()
    let calls = 0
    const factory = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 20)); return 42 }
    const [a, b] = await Promise.all([cache.load('k', 1_000, factory), cache.load('k', 1_000, factory)])
    expect(a).toBe(42)
    expect(b).toBe(42)
    expect(calls).toBe(1)
  })

  test('never caches a rejected factory — the next call tries again', async () => {
    const cache = new EstimateCache<number>()
    let attempt = 0
    const factory = async () => {
      attempt++
      if (attempt === 1) throw new Error('network')
      return attempt
    }
    await expect(cache.load('k', 1_000, factory)).rejects.toThrow('network')
    expect(await cache.load('k', 1_000, factory)).toBe(2)
  })

  test('keys are independent', async () => {
    const cache = new EstimateCache<string>()
    expect(await cache.load('a', 1_000, async () => 'A')).toBe('A')
    expect(await cache.load('b', 1_000, async () => 'B')).toBe('B')
    expect(cache.get('a')).toBe('A')
    expect(cache.get('b')).toBe('B')
    expect(cache.get('c')).toBeUndefined()
  })
})
