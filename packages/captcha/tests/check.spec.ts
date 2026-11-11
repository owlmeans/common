import { describe, expect, test } from 'bun:test'
import { AuthenFailed, AuthUnavailable } from '@owlmeans/auth'
import { PluginMissconfigured } from '@owlmeans/config'
import { addLogPlugin, memoryPlugin } from '@owlmeans/log'
import { makeCaptchaCheck } from '../src/check.js'
import type { CaptchaSettings, CaptchaVerdict } from '../src/types.js'
import { makeTestCtx, makeTestProvider } from './context.js'

const SETTINGS: CaptchaSettings = { hostnames: 'owlmeans.org, owlmeans.com', minScore: '0.5' }

const GOOD: CaptchaVerdict = {
  success: true, at: '2026-10-06T10:00:00Z', hostname: 'vib-dev-1.owlmeans.org', score: 0.9, action: 'email_pin',
}

const failure = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('expected a refusal')
}

describe('@owlmeans/captcha — strict check', () => {
  test('off without settings: nothing to advertise, nothing asked, every call passes, boot passes', async () => {
    const provider = makeTestProvider({ verdict: GOOD })
    const context = await makeTestCtx({ providers: [provider] })

    const off = makeCaptchaCheck(context, null)
    expect(off.enabled()).toBe(false)
    expect(off.clientSettings()).toBeNull()
    off.assertReady()
    await off.assert({ action: 'email_pin' })
    expect(provider.asked).toHaveLength(0)

    const bare = await makeTestCtx()
    makeCaptchaCheck(bare, null).assertReady()
    await makeCaptchaCheck(bare, null).assert({ token: 'token', action: 'email_pin' })
  })

  test('on: advertises the provider\'s client settings and passes a good token with the action and the IP', async () => {
    const provider = makeTestProvider({ verdict: GOOD })
    const context = await makeTestCtx({ providers: [provider] })

    const check = makeCaptchaCheck(context, SETTINGS)
    expect(check.enabled()).toBe(true)
    expect(check.clientSettings()).toEqual({ provider: 'test', siteKey: 'site-key' })
    check.assertReady()

    await check.assert({ token: 'provider-token', action: 'email_pin', remoteIp: '203.0.113.7' })
    await makeCaptchaCheck(context, { provider: 'test', hostnames: [' OwlMeans.org ', 'example.com'], minScore: 0.9 })
      .assert({ token: 'provider-token', action: 'email_pin' })

    expect(provider.asked).toEqual([
      { token: 'provider-token', action: 'email_pin', remoteIp: '203.0.113.7' },
      { token: 'provider-token', action: 'email_pin' },
    ])
  })

  test('picks the provider the settings name, and only the only one when they name none', async () => {
    const one = makeTestProvider({ id: 'one', verdict: GOOD })
    const two = makeTestProvider({ id: 'two', verdict: GOOD, siteKey: 'second' })
    const context = await makeTestCtx({ providers: [one, two] })

    expect(makeCaptchaCheck(context, { ...SETTINGS, provider: 'two' }).clientSettings()).toEqual({ provider: 'two', siteKey: 'second' })
    await makeCaptchaCheck(context, { ...SETTINGS, provider: 'two' }).assert({ token: 't', action: 'email_pin' })
    expect([one.asked.length, two.asked.length]).toEqual([0, 1])

    // Two registered and none named: no guess.
    expect(() => makeCaptchaCheck(context, SETTINGS).assertReady()).toThrow(PluginMissconfigured)
  })

  test('fails closed without a registered provider: a boot error, and unavailability at the call', async () => {
    const memory = memoryPlugin('captcha-provider')
    const remove = addLogPlugin(memory)
    try {
      for (const context of [await makeTestCtx(), await makeTestCtx({ providers: [makeTestProvider({ id: 'other', verdict: GOOD })] })]) {
        const check = makeCaptchaCheck(context, { ...SETTINGS, provider: 'test' })
        expect(() => check.assertReady()).toThrow(PluginMissconfigured)
        expect(() => check.clientSettings()).toThrow('captcha:provider:test')

        const error = await failure(check.assert({ token: 'token', action: 'email_pin' }))
        expect(error).toBeInstanceOf(AuthUnavailable)
        expect(error.message).toContain('captcha:config')
      }
      expect(memory.records.some(record => record.level === 'error' && record.event === 'auth.captcha.provider')).toBe(true)
    } finally {
      remove()
    }
  })

  test('refuses each way a token can fail, with the documented reason', async () => {
    const cases: [Partial<CaptchaVerdict>, string | null | undefined, string][] = [
      [{}, undefined, 'captcha:missing'],
      [{}, null, 'captcha:missing'],
      [{}, '', 'captcha:missing'],
      [{ success: false, errors: ['timeout-or-duplicate'] }, 'token', 'captcha:timeout-or-duplicate'],
      [{ success: false }, 'token', 'captcha:unknown'],
      [{ score: undefined }, 'token', 'captcha:score'],
      [{ score: 0.49 }, 'token', 'captcha:score'],
      [{ hostname: 'evil.com' }, 'token', 'captcha:hostname'],
      [{ hostname: 'notowlmeans.org' }, 'token', 'captcha:hostname'],
      [{ hostname: '' }, 'token', 'captcha:hostname'],
      [{ action: 'email_password' }, 'token', 'captcha:action'],
      [{ action: undefined }, 'token', 'captcha:action'],
      [{ hostname: 'evil.com', score: 0.1, action: 'other' }, 'token', 'captcha:score'],
    ]
    for (const [answer, token, reason] of cases) {
      const provider = makeTestProvider({ verdict: { ...GOOD, ...answer } })
      const context = await makeTestCtx({ providers: [provider] })
      const error = await failure(makeCaptchaCheck(context, SETTINGS).assert({ token, action: 'email_pin' }))

      expect([answer, token, error]).toEqual([answer, token, expect.any(AuthenFailed)])
      expect([answer, token, error.message]).toEqual([answer, token, expect.stringContaining(reason)])
      expect(provider.asked).toHaveLength(reason === 'captcha:missing' ? 0 : 1)
    }
  })

  test('on with incomplete settings or no site key fails closed before the provider is asked, logging once', async () => {
    const memory = memoryPlugin('captcha-check')
    const remove = addLogPlugin(memory)
    try {
      const cases: [CaptchaSettings, string][] = [
        [{ ...SETTINGS, hostnames: '' }, ''],
        [{ ...SETTINGS, hostnames: [] }, 'site-key'],
        [{ ...SETTINGS, hostnames: [' ', ','] }, 'site-key'],
        [{ minScore: '0.5' }, 'site-key'],
        [{ ...SETTINGS, minScore: '' }, 'site-key'],
        [{ ...SETTINGS, minScore: 'high' }, 'site-key'],
        [{ ...SETTINGS, minScore: 1.5 }, 'site-key'],
        [{ ...SETTINGS, minScore: -0.1 }, 'site-key'],
        [{ hostnames: 'owlmeans.org' }, 'site-key'],
        [SETTINGS, ''],
      ]
      for (const [settings, siteKey] of cases) {
        const provider = makeTestProvider({ verdict: GOOD, siteKey })
        const context = await makeTestCtx({ providers: [provider] })
        const check = makeCaptchaCheck(context, settings)
        memory.clear()
        for (let attempt = 0; attempt < 2; attempt++) {
          const error = await failure(check.assert({ token: 'token', action: 'email_pin' }))
          expect([settings, error]).toEqual([settings, expect.any(AuthUnavailable)])
          expect(error.message).toContain('captcha:config')
        }
        expect(provider.asked).toHaveLength(0)
        expect(memory.records.filter(record => record.level === 'error' && record.event === 'auth.captcha.config'))
          .toHaveLength(1)
      }
    } finally {
      remove()
    }
  })

  test('a provider that cannot be asked is unavailability, never a pass', async () => {
    const provider = makeTestProvider({ failure: new AuthUnavailable('captcha') })
    const context = await makeTestCtx({ providers: [provider] })
    const error = await failure(makeCaptchaCheck(context, SETTINGS).assert({ token: 'token', action: 'email_pin' }))

    expect(error).toBeInstanceOf(AuthUnavailable)
    expect(error.message).toContain('captcha')
    expect(error.message).not.toContain('captcha:config')
  })

  test('a score floor of 0 and a string floor are valid', async () => {
    const context = await makeTestCtx({ providers: [makeTestProvider({ verdict: { ...GOOD, score: 0 } })] })

    await makeCaptchaCheck(context, { ...SETTINGS, minScore: 0 }).assert({ token: 'token', action: 'email_pin' })
    await makeCaptchaCheck(context, { ...SETTINGS, minScore: ' 0 ' }).assert({ token: 'token', action: 'email_pin' })
    expect(await failure(makeCaptchaCheck(context, { ...SETTINGS, minScore: '0.1' }).assert({ token: 'token', action: 'email_pin' })))
      .toBeInstanceOf(AuthenFailed)
  })
})
