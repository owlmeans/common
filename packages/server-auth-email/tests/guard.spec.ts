import { describe, expect, test } from 'bun:test'
import { AuthenFailed } from '@owlmeans/auth'
import { EMAIL_CAPTCHA_ACTION_PASSWORD, EMAIL_CAPTCHA_ACTION_PIN, EMAIL_WAIVER_HEADER, EmailPasswordPurpose } from '@owlmeans/auth-email'
import { OtpThrottled } from '@owlmeans/server-auth-otp'
import { DEVICE_A, DEVICE_B, TECH_SIGNER, failure, makeEmailAuthFixture, statusOf } from './context.js'
import type { EmailAuthFixture } from './context.js'

const waiverOf = async (env: EmailAuthFixture): Promise<string> =>
  (await env.service.techWaiver(await env.signed(TECH_SIGNER))).waiver

describe('@owlmeans/server-auth-email — captcha', () => {
  test('send-PIN and password sign-in need a token for their own action; a refusal is a 403 AuthenFailed', async () => {
    const env = await makeEmailAuthFixture({ captcha: true, ipOf: () => '203.0.113.7' })

    expect((await env.service.options(env.guest())).captcha).toEqual({ provider: 'recaptcha-v3', siteKey: 'site-key' })
    for (const captcha of [undefined, 'refused', `ok:${EMAIL_CAPTCHA_ACTION_PASSWORD}`]) {
      const error = await failure(env.service.sendPin({ email: 'cap@example.org', captcha }, env.guest()))
      expect(error).toBeInstanceOf(AuthenFailed)
      expect(statusOf(error)).toBe(403)
    }
    expect(env.mailer.captured).toHaveLength(0)

    await env.service.sendPin({ email: 'cap@example.org', captcha: `ok:${EMAIL_CAPTCHA_ACTION_PIN}` }, env.guest())
    expect(env.asked.at(-1)).toEqual({ secret: 'secret', response: `ok:${EMAIL_CAPTCHA_ACTION_PIN}`, remoteip: '203.0.113.7' })

    const password = await failure(env.service.signIn({
      email: 'cap@example.org', device: DEVICE_A, password: 'some password', captcha: `ok:${EMAIL_CAPTCHA_ACTION_PIN}`,
    }, env.guest()))
    expect(statusOf(password)).toBe(403)
    const answer = await env.service.signIn({
      email: 'cap@example.org', device: DEVICE_A, password: 'some password', captcha: `ok:${EMAIL_CAPTCHA_ACTION_PASSWORD}`,
    }, env.guest())
    expect(answer.challenge).toBeDefined()
  })

  test('a PIN sign-in asks no captcha', async () => {
    const env = await makeEmailAuthFixture({ captcha: true })
    const { challenge } = await env.service.sendPin({ email: 'nocap@example.org', captcha: `ok:${EMAIL_CAPTCHA_ACTION_PIN}` }, env.guest())
    const asked = env.asked.length

    const answer = await env.service.signIn({ email: 'nocap@example.org', device: DEVICE_A, challenge, pin: env.codeOf() }, env.guest())

    expect(answer.token).toBeDefined()
    expect(env.asked).toHaveLength(asked)
  })

  test('a valid waiver skips the captcha (options say none); it is ignored while the developer routes are off', async () => {
    let tech = true
    const env = await makeEmailAuthFixture({ captcha: true, tech: () => tech })
    const waived = env.guest({ headers: { [EMAIL_WAIVER_HEADER]: await waiverOf(env) } })

    expect((await env.service.options(waived)).captcha).toBeNull()
    await env.service.sendPin({ email: 'waived@example.org' }, waived)
    expect((await env.service.signIn({ email: 'waived@example.org', device: DEVICE_A, password: 'some password' }, waived)).challenge)
      .toBeDefined()
    expect(env.asked).toHaveLength(0)

    // A forged or foreign waiver counts for nothing.
    const forged = env.guest({ headers: { [EMAIL_WAIVER_HEADER]: await env.challengeOf('email-waiver', 'email-waiver:x') } })
    expect(statusOf(await failure(env.service.sendPin({ email: 'waived@example.org' }, forged)))).toBe(403)

    tech = false
    expect((await env.service.options(waived)).captcha).not.toBeNull()
    expect(statusOf(await failure(env.service.sendPin({ email: 'waived@example.org' }, waived)))).toBe(403)
  })
})

describe('@owlmeans/server-auth-email — throttles', () => {
  test('send-PIN: one per address a minute (429 with retryAfter) — under keys that never hold the address', async () => {
    const env = await makeEmailAuthFixture({ throttle: true, ipOf: () => '198.51.100.1' })

    await env.service.sendPin({ email: 'rate@example.org' }, env.guest())
    const throttled = await failure(env.service.sendPin({ email: 'RATE@example.org' }, env.guest()))
    expect(throttled).toBeInstanceOf(OtpThrottled)
    expect(statusOf(throttled)).toBe(429)
    expect((throttled as OtpThrottled).retryAfter).toBe(60)
    // Another address is not held back; a minute later this one is free again.
    await env.service.sendPin({ email: 'other@example.org' }, env.guest())
    env.clock.now += 61_000
    await env.service.sendPin({ email: 'rate@example.org' }, env.guest())
  })

  test('confirmation PINs are throttled per account under their own key, apart from sign-in PINs', async () => {
    const env = await makeEmailAuthFixture({ throttle: true })
    const alice = await env.pinSignIn('alice@example.org')
    env.clock.now += 61_000
    const bob = await env.pinSignIn('bob@example.org')

    // A sign-in PIN to alice's address a moment ago does not hold back her confirmation PIN …
    await env.service.sendPin({ email: 'alice@example.org' }, env.guest())
    await env.service.confirmPin({ purpose: EmailPasswordPurpose.Set }, env.session(alice.accountId))
    // … a second confirmation within the minute is held back, and bob's is not.
    expect(await failure(env.service.confirmPin({ purpose: EmailPasswordPurpose.Set }, env.session(alice.accountId))))
      .toBeInstanceOf(OtpThrottled)
    await env.service.confirmPin({ purpose: EmailPasswordPurpose.Set }, env.session(bob.accountId))
  })

  test('password sign-in: ten per address in fifteen minutes; the device PIN takes the address PIN window too', async () => {
    const env = await makeEmailAuthFixture({ throttle: true })
    const first = await env.service.signIn({ email: 'brute@example.org', device: DEVICE_A, password: 'guess number 0' }, env.guest())
    expect(first.challenge).toBeDefined()
    // The next device PIN of the address falls into its one-a-minute PIN window.
    expect(await failure(env.service.signIn({ email: 'brute@example.org', device: DEVICE_A, password: 'guess number 1' }, env.guest())))
      .toBeInstanceOf(OtpThrottled)
    for (let attempt = 2; attempt < 10; attempt += 1) {
      env.clock.now += 61_000
      await env.service.signIn({ email: 'brute@example.org', device: DEVICE_B, password: `guess number ${attempt}` }, env.guest())
    }
    env.clock.now += 61_000
    const held = await failure(env.service.signIn({ email: 'brute@example.org', device: DEVICE_B, password: 'guess number 10' }, env.guest()))
    expect(held).toBeInstanceOf(OtpThrottled)
  })

  test('a valid waiver skips every throttle; without a throttle service there are none', async () => {
    const env = await makeEmailAuthFixture({ throttle: true })
    const waived = env.guest({ headers: { [EMAIL_WAIVER_HEADER]: await waiverOf(env) } })
    for (let round = 0; round < 3; round += 1) {
      await env.service.sendPin({ email: 'free@example.org' }, waived)
    }

    const open = await makeEmailAuthFixture()
    for (let round = 0; round < 3; round += 1) {
      await open.service.sendPin({ email: 'free@example.org' }, open.guest())
    }
    expect(open.mailer.captured).toHaveLength(3)
  })
})
