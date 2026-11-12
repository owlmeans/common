import { describe, expect, test } from 'bun:test'
import { PluginMissconfigured } from '@owlmeans/config'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import { CAPTCHA_SERVICE, MOD_CAPTCHA } from '../src/consts.js'
import { captchaResolverOf } from '../src/resolver.js'
import { createCaptchaService, ensureCaptchaService } from '../src/service.js'
import { makeTestCtx, makeTestProvider } from './context.js'

describe('@owlmeans/captcha — the provider host', () => {
  test('keeps providers by id; a provider of the same id replaces the first; no id = the only one', () => {
    const host = createCaptchaService()
    expect(host.alias).toBe(CAPTCHA_SERVICE)
    expect(host.get()).toBeNull()

    const first = makeTestProvider({ id: 'one' })
    host.register(first)
    expect(host.get()).toBe(first)
    expect(host.get('one')).toBe(first)
    expect(host.get('two')).toBeNull()

    const second = makeTestProvider({ id: 'two' })
    host.register(second)
    expect(host.get()).toBeNull()
    expect(host.get('two')).toBe(second)

    const replaced = makeTestProvider({ id: 'one' })
    host.register(replaced)
    expect(host.get('one')).toBe(replaced)
    expect(host.list().map(provider => provider.id)).toEqual(['two', 'one'])
  })

  test('ensure registers one host per context, reachable before and after the context initializes', async () => {
    const context = makeBasicContext<BasicConfig>({ ready: false, service: 'captcha-tests', type: AppType.Backend, services: {} })
    const host = ensureCaptchaService(context)
    expect(ensureCaptchaService(context)).toBe(host)
    host.register(makeTestProvider())
    context.configure()
    await context.init()

    expect(ensureCaptchaService(context)).toBe(host)
    expect(captchaResolverOf(context).find()?.id).toBe('test')
  })

  test('the resolver never registers a host, and finds nothing without one', async () => {
    const context = await makeTestCtx()

    expect(captchaResolverOf(context).find()).toBeNull()
    expect(captchaResolverOf(context).record()).toBeNull()
    expect(context.hasService(CAPTCHA_SERVICE)).toBe(false)
    expect(() => captchaResolverOf(context).provider('test')).toThrow(PluginMissconfigured)
    // No `MOD_CAPTCHA` record: nothing to be ready for.
    captchaResolverOf(context).assertReady()
  })

  test('a declared MOD_CAPTCHA record whose provider is not registered fails the boot', async () => {
    const declared = { id: MOD_CAPTCHA, provider: 'test', hostnames: 'owlmeans.org' }

    const ready = await makeTestCtx({ providers: [makeTestProvider()], plugins: [declared] })
    expect(captchaResolverOf(ready).record()).toMatchObject({ provider: 'test' })

    await expect(makeTestCtx({ providers: [makeTestProvider({ id: 'other' })], plugins: [declared] }))
      .rejects.toThrow('captcha:provider:test')
    await expect(makeTestCtx({
      providers: [makeTestProvider({ id: 'one' }), makeTestProvider({ id: 'two' })], plugins: [{ id: MOD_CAPTCHA }],
    })).rejects.toBeInstanceOf(PluginMissconfigured)
  })
})
