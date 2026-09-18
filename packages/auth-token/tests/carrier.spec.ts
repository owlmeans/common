import { describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { GuardService } from '@owlmeans/entrypoint'
import { makeTokenCarrierGuard } from '../src/carrier.js'

const contextWith = async (guard: GuardService): Promise<BasicContext<BasicConfig>> => {
  const cfg: BasicConfig = { ready: false, service: 'carrier-tests', type: AppType.Backend, services: {} }
  const context = makeBasicContext(cfg) as BasicContext<BasicConfig>
  context.registerService(guard)
  context.configure()
  await context.init()

  return context
}

describe('@owlmeans/auth-token — the client carrier guard', () => {
  test('presents the OwlMeans scheme by default', async () => {
    const guard = makeTokenCarrierGuard('carrier', { token: 'owl_secret' })
    await contextWith(guard)

    expect(await guard.authenticated()).toBe('AUTH-TOKEN owl_secret')
  })

  test('presents Bearer when asked — what a URL-configured client sends', async () => {
    const guard = makeTokenCarrierGuard('carrier', { token: 'owl_secret', scheme: 'bearer' })
    await contextWith(guard)

    expect(await guard.authenticated()).toBe('Bearer owl_secret')
  })

  test('resolves a thunk on every call, so a reconfigured token is picked up', async () => {
    let current = 'owl_first'
    const guard = makeTokenCarrierGuard('carrier', { token: () => current })
    await contextWith(guard)

    expect(await guard.authenticated()).toBe('AUTH-TOKEN owl_first')
    current = 'owl_second'
    expect(await guard.authenticated()).toBe('AUTH-TOKEN owl_second')
  })

  test('holds no credential when the token is empty, and matches nothing', async () => {
    const guard = makeTokenCarrierGuard('carrier', { token: '' })
    await contextWith(guard)

    expect(await guard.authenticated()).toBeNull()
    expect(await guard.match({} as any, {} as any)).toBe(false)
  })
})
