import { describe, expect, test } from 'bun:test'
import { AuthUnavailable } from '@owlmeans/auth'
import { CAPTCHA_VERIFIER, RECAPTCHA_SITEVERIFY_URL, RECAPTCHA_VERIFY_TIMEOUT } from '../src/consts.js'
import type { CaptchaFetch, CaptchaResponse, CaptchaVerifierService } from '../src/types.js'
import { createCaptchaVerifierService } from '../src/verifier.js'
import { makeTestCtx } from './context.js'

const GOOD: CaptchaResponse = {
  success: true, challenge_ts: '2026-10-06T10:00:00Z', hostname: 'owlmeans.org', score: 0.9, action: 'email_pin',
}

interface Call { url: string, init: RequestInit }

/** A `fetch` stand-in answering `status` with `body`, recording each call. */
const answering = (status: number, body: unknown, calls: Call[] = []): CaptchaFetch =>
  async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  }

describe('@owlmeans/captcha — the default verifier', () => {
  test('posts the siteverify form to Google over https', async () => {
    const calls: Call[] = []
    const verifier = createCaptchaVerifierService(CAPTCHA_VERIFIER, { fetch: answering(200, GOOD, calls) })

    expect(await verifier.verify({ secret: 's', response: 'r', remoteip: '203.0.113.7' })).toEqual(GOOD)
    expect(await verifier.verify({ secret: 's', response: 'r', remoteip: '' })).toEqual(GOOD)
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toBe(RECAPTCHA_SITEVERIFY_URL)
    expect(RECAPTCHA_SITEVERIFY_URL).toStartWith('https://www.google.com/')
    expect(calls[0].init.method).toBe('POST')
    expect(new Headers(calls[0].init.headers).get('content-type')).toBe('application/x-www-form-urlencoded')
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
    expect(Object.fromEntries(calls[0].init.body as URLSearchParams)).toEqual({ secret: 's', response: 'r', remoteip: '203.0.113.7' })
    expect(Object.fromEntries(calls[1].init.body as URLSearchParams)).toEqual({ secret: 's', response: 'r' })
    expect(RECAPTCHA_VERIFY_TIMEOUT).toBe(10_000)
  })

  test('an unreachable or unreadable Google is unavailability, not a refusal', async () => {
    const failing: CaptchaFetch = async () => { throw new Error('offline') }
    for (const fetch of [failing, answering(500, GOOD), answering(200, { nothing: true }), answering(200, null)]) {
      await expect(createCaptchaVerifierService(CAPTCHA_VERIFIER, { fetch }).verify({ secret: 's', response: 'r' }))
        .rejects.toBeInstanceOf(AuthUnavailable)
    }
    const garbage: CaptchaFetch = async () => new Response('<html>', { status: 200 })
    await expect(createCaptchaVerifierService(CAPTCHA_VERIFIER, { fetch: garbage }).verify({ secret: 's', response: 'r' }))
      .rejects.toThrow('recaptcha')
  })

  test('a refusal is an answer, not an error', async () => {
    const refusal: CaptchaResponse = { ...GOOD, success: false, 'error-codes': ['invalid-input-response'] }
    const verifier = createCaptchaVerifierService(CAPTCHA_VERIFIER, { fetch: answering(200, refusal) })

    expect(await verifier.verify({ secret: 's', response: 'r' })).toEqual(refusal)
  })

  test('refuses a siteverify address that is not https', () => {
    expect(() => createCaptchaVerifierService(CAPTCHA_VERIFIER, { url: 'http://www.google.com/recaptcha/api/siteverify' }))
      .toThrow(SyntaxError)
  })

  test('append registers a verifier under the shared alias', async () => {
    const { context } = await makeTestCtx({ fetch: answering(200, GOOD) })

    expect(CAPTCHA_VERIFIER).toBe('re-captcha-verifier')
    expect(context.hasService(CAPTCHA_VERIFIER)).toBe(true)
    expect(await context.service<CaptchaVerifierService>(CAPTCHA_VERIFIER).verify({ secret: 's', response: 'r' })).toEqual(GOOD)
  })
})
