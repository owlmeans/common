import { describe, expect, test } from 'bun:test'
import { createService } from '@owlmeans/context'
import { makeTestCtx } from './context.js'

describe('@owlmeans/context — service registration', () => {
  test('registers a service and resolves it by alias after initialization', async () => {
    const ctx = makeTestCtx()
    const stub = createService('alpha', {})
    ctx.registerService(stub)
    expect(ctx.hasService('alpha')).toBe(true)
    ctx.configure()
    await ctx.init()
    expect(ctx.service('alpha')).toBe(stub)
  })

  test('hasService is false for an alias that was never registered', () => {
    const ctx = makeTestCtx()
    expect(ctx.hasService('missing')).toBe(false)
  })
})
