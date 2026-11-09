import { describe, expect, test } from 'bun:test'
import { AuthenFailed, AuthUnavailable } from '@owlmeans/auth'
import { addLogPlugin, memoryPlugin } from '@owlmeans/log'
import { makeCaptchaCheck } from '../src/check.js'
import type { CaptchaResponse, CaptchaSettings } from '../src/types.js'
import { makeTestCtx } from './context.js'

const SETTINGS: CaptchaSettings = {
  siteKey: 'site-key', secret: 'secret', hostnames: 'owlmeans.org, owlmeans.com', minScore: '0.5',
}

const GOOD: CaptchaResponse = {
  success: true, challenge_ts: '2026-10-06T10:00:00Z', hostname: 'vib-dev-1.owlmeans.org', score: 0.9, action: 'email_pin',
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
  test('off without a site key: nothing to render, nothing asked, every call passes', async () => {
    const { context, asked } = await makeTestCtx({ answer: GOOD })

    for (const settings of [null, { ...SETTINGS, siteKey: '' }, { ...SETTINGS, siteKey: '  ', secret: '' }]) {
      const check = makeCaptchaCheck(context, settings)
      expect(check.enabled()).toBe(false)
      expect(check.siteKey()).toBeNull()
      await check.assert({ action: 'email_pin' })
    }
    expect(asked).toHaveLength(0)

    const on = makeCaptchaCheck(context, SETTINGS)
    expect(on.enabled()).toBe(true)
    expect(on.siteKey()).toBe('site-key')
  })

  test('passes a good token, asking the registered verifier with the secret, the token and the IP', async () => {
    const { context, asked } = await makeTestCtx({ answer: GOOD })

    await makeCaptchaCheck(context, SETTINGS).assert({ token: 'google-token', action: 'email_pin', remoteip: '203.0.113.7' })
    await makeCaptchaCheck(context, { ...SETTINGS, hostnames: [' OwlMeans.org ', 'example.com'], minScore: 0.9 })
      .assert({ token: 'google-token', action: 'email_pin' })

    expect(asked).toEqual([
      { secret: 'secret', response: 'google-token', remoteip: '203.0.113.7' },
      { secret: 'secret', response: 'google-token' },
    ])
  })

  test('refuses each way a token can fail, with the documented reason', async () => {
    const cases: [Partial<CaptchaResponse>, string | null | undefined, string][] = [
      [{}, undefined, 'recaptcha:missing'],
      [{}, null, 'recaptcha:missing'],
      [{}, '', 'recaptcha:missing'],
      [{ success: false, 'error-codes': ['timeout-or-duplicate'] }, 'token', 'recaptcha:timeout-or-duplicate'],
      [{ success: false }, 'token', 'recaptcha:unknown'],
      [{ score: undefined }, 'token', 'recaptcha:score'],
      [{ score: 0.49 }, 'token', 'recaptcha:score'],
      [{ hostname: 'evil.com' }, 'token', 'recaptcha:hostname'],
      [{ hostname: 'notowlmeans.org' }, 'token', 'recaptcha:hostname'],
      [{ hostname: '' }, 'token', 'recaptcha:hostname'],
      [{ action: 'email_password' }, 'token', 'recaptcha:action'],
      [{ action: undefined }, 'token', 'recaptcha:action'],
      [{ hostname: 'evil.com', score: 0.1, action: 'other' }, 'token', 'recaptcha:score'],
    ]
    for (const [answer, token, reason] of cases) {
      const { context, asked } = await makeTestCtx({ answer: { ...GOOD, ...answer } })
      const error = await failure(makeCaptchaCheck(context, SETTINGS).assert({ token, action: 'email_pin' }))

      expect([answer, token, error]).toEqual([answer, token, expect.any(AuthenFailed)])
      expect([answer, token, error.message]).toEqual([answer, token, expect.stringContaining(reason)])
      expect(asked).toHaveLength(reason === 'recaptcha:missing' ? 0 : 1)
    }
  })

  test('an enabled check with incomplete settings fails closed before Google is asked, logging once', async () => {
    const memory = memoryPlugin('captcha-check')
    const remove = addLogPlugin(memory)
    try {
      for (const settings of [
        { ...SETTINGS, secret: '' },
        { ...SETTINGS, hostnames: '' },
        { ...SETTINGS, hostnames: [] },
        { ...SETTINGS, hostnames: [' ', ','] },
        { ...SETTINGS, minScore: '' },
        { ...SETTINGS, minScore: 'high' },
        { ...SETTINGS, minScore: 1.5 },
        { ...SETTINGS, minScore: -0.1 },
      ]) {
        const { context, asked } = await makeTestCtx({ answer: GOOD })
        const check = makeCaptchaCheck(context, settings)
        memory.clear()
        for (let attempt = 0; attempt < 2; attempt++) {
          const error = await failure(check.assert({ token: 'token', action: 'email_pin' }))
          expect([settings, error]).toEqual([settings, expect.any(AuthUnavailable)])
          expect(error.message).toContain('recaptcha:config')
        }
        expect(asked).toHaveLength(0)
        expect(memory.records.filter(record => record.level === 'error' && record.event === 'auth.recaptcha.config'))
          .toHaveLength(1)
      }
    } finally {
      remove()
    }
  })

  test('an unreachable Google is unavailability, never a pass', async () => {
    const { context } = await makeTestCtx({ fetch: async () => { throw new Error('offline') } })
    const error = await failure(makeCaptchaCheck(context, SETTINGS).assert({ token: 'token', action: 'email_pin' }))

    expect(error).toBeInstanceOf(AuthUnavailable)
    expect(error.message).toContain('recaptcha')
    expect(error.message).not.toContain('recaptcha:config')
  })

  test('a score floor of 0 and a string floor are valid', async () => {
    const { context } = await makeTestCtx({ answer: { ...GOOD, score: 0 } })

    await makeCaptchaCheck(context, { ...SETTINGS, minScore: 0 }).assert({ token: 'token', action: 'email_pin' })
    await makeCaptchaCheck(context, { ...SETTINGS, minScore: ' 0 ' }).assert({ token: 'token', action: 'email_pin' })
    expect(await failure(makeCaptchaCheck(context, { ...SETTINGS, minScore: '0.1' }).assert({ token: 'token', action: 'email_pin' })))
      .toBeInstanceOf(AuthenFailed)
  })
})
