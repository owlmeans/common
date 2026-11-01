import { describe, expect, test } from 'bun:test'
import { AuthenFailed } from '@owlmeans/auth'
import { OtpThrottled } from '../src/errors.js'
import { OTP_TTL_SECONDS } from '../src/consts.js'
import { codeFrom, makeOtpTestContext, otherCode } from './context.js'

const wrongFor = (code: string): string => code === '000000' ? '999999' : '000000'

describe('@owlmeans/server-auth-otp — challenge lifecycle', () => {
  test('issues cryptographic-looking codes under independent opaque issuance ids', async () => {
    const { context, mailer, otp } = makeOtpTestContext()
    await context.configure().init()

    const first = await otp.issueChallenge('Alice+one@example.com')
    const second = await otp.issueChallenge('alice+one@example.com')
    const firstCode = codeFrom(mailer.captured[0].text)
    const secondCode = codeFrom(mailer.captured[1].text)

    expect(first).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(second).not.toBe(first)
    expect(firstCode).toMatch(/^\d{6}$/)
    expect(secondCode).toMatch(/^\d{6}$/)
    await otp.verifyChallenge('alice+one@example.com', first, firstCode)
    await otp.verifyChallenge('alice+one@example.com', second, secondCode)
  })

  test('allows four failed guesses and consumes the challenge on a correct fifth try', async () => {
    const { context, mailer, otp } = makeOtpTestContext()
    await context.configure().init()
    const issuanceId = await otp.issueChallenge('four@example.com')
    const code = codeFrom(mailer.captured[0].text)

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(otp.verifyChallenge('four@example.com', issuanceId, wrongFor(code)))
        .rejects.toBeInstanceOf(AuthenFailed)
    }
    await expect(otp.verifyChallenge('four@example.com', issuanceId, code)).resolves.toBeUndefined()
  })

  test('invalidates the challenge on exactly the fifth failed guess', async () => {
    const { context, mailer, otp } = makeOtpTestContext()
    await context.configure().init()
    const issuanceId = await otp.issueChallenge('five@example.com')
    const code = codeFrom(mailer.captured[0].text)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(otp.verifyChallenge('five@example.com', issuanceId, wrongFor(code)))
        .rejects.toBeInstanceOf(AuthenFailed)
    }
    await expect(otp.verifyChallenge('five@example.com', issuanceId, code))
      .rejects.toBeInstanceOf(AuthenFailed)
  })

  test('only one concurrent correct verification consumes an issuance', async () => {
    const { context, mailer, otp } = makeOtpTestContext()
    await context.configure().init()
    const issuanceId = await otp.issueChallenge('replay@example.com')
    const code = codeFrom(mailer.captured[0].text)

    const results = await Promise.allSettled([
      otp.verifyChallenge('replay@example.com', issuanceId, code),
      otp.verifyChallenge('replay@example.com', issuanceId, code),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  })
})

describe('@owlmeans/server-auth-otp — issuance throttle', () => {
  test('enforces one per minute and ten per hour with retry metadata', async () => {
    let now = 0
    const fixture = makeOtpTestContext({ throttle: true, now: () => now })
    await fixture.context.configure().init()

    await fixture.otp.issueChallenge('rate@example.com')
    const minute = await fixture.otp.issueChallenge('RATE@example.com').catch(error => error)
    expect(minute).toBeInstanceOf(OtpThrottled)
    expect((minute as OtpThrottled).retryAfter).toBe(60)

    for (let issued = 1; issued < 10; issued += 1) {
      now += 61_000
      await fixture.otp.issueChallenge('rate@example.com')
    }
    now += 61_000
    const hour = await fixture.otp.issueChallenge('rate@example.com').catch(error => error)
    expect(hour).toBeInstanceOf(OtpThrottled)
    expect((hour as OtpThrottled).retryAfter).toBeGreaterThan(0)
  })
})

describe('@owlmeans/server-auth-otp — login-code mail', () => {
  test('the default mail stays the unchanged English text', async () => {
    const { context, mailer, otp } = makeOtpTestContext()
    await context.configure().init()
    await otp.issueChallenge('default@example.com')
    const code = codeFrom(mailer.captured[0].text)

    expect(mailer.captured[0]).toEqual({
      to: 'default@example.com',
      subject: 'Your login code',
      text: `Your one-time login code is: ${code}\n\nIt expires in 10 minutes.`,
      html: `<p>Your one-time login code is: <strong>${code}</strong></p><p>It expires in 10 minutes.</p>`,
    })
  })

  test('a message override fills {{code}} and {{minutes}} in every part', async () => {
    const { context, mailer, otp } = makeOtpTestContext()
    await context.configure().init()
    const issuanceId = await otp.issueChallenge('custom@example.com', {
      message: {
        subject: 'Kod {{code}}',
        text: 'Twój kod: {{code}} ({{minutes}} min) — {{code}}',
        html: '<p><b>{{code}}</b> · {{minutes}}</p>',
      },
    })
    const code = codeFrom(mailer.captured[0].text)
    const minutes = String(OTP_TTL_SECONDS / 60)

    expect(mailer.captured[0]).toEqual({
      to: 'custom@example.com',
      subject: `Kod ${code}`,
      text: `Twój kod: ${code} (${minutes} min) — ${code}`,
      html: `<p><b>${code}</b> · ${minutes}</p>`,
    })
    await expect(otp.verifyChallenge('custom@example.com', issuanceId, code)).resolves.toBeUndefined()
  })
})

describe('@owlmeans/server-auth-otp — developer rewrite', () => {
  test('a rewritten code verifies and the mailed one no longer does', async () => {
    const { context, mailer, otp } = makeOtpTestContext()
    await context.configure().init()
    const issuanceId = await otp.issueChallenge('swap@example.com')
    const mailed = codeFrom(mailer.captured[0].text)
    const next = otherCode(mailed)

    expect(await otp.rewriteChallenge!('SWAP@example.com', issuanceId, next)).toBe(true)
    await expect(otp.verifyChallenge('swap@example.com', issuanceId, mailed)).rejects.toBeInstanceOf(AuthenFailed)
    await expect(otp.verifyChallenge('swap@example.com', issuanceId, next)).resolves.toBeUndefined()
  })

  test('a rewrite resets the failed attempts', async () => {
    const { context, mailer, otp } = makeOtpTestContext()
    await context.configure().init()
    const issuanceId = await otp.issueChallenge('reset@example.com')
    const next = otherCode(codeFrom(mailer.captured[0].text))

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(otp.verifyChallenge('reset@example.com', issuanceId, wrongFor(next)))
        .rejects.toBeInstanceOf(AuthenFailed)
    }
    expect(await otp.rewriteChallenge!('reset@example.com', issuanceId, next)).toBe(true)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(otp.verifyChallenge('reset@example.com', issuanceId, wrongFor(next)))
        .rejects.toBeInstanceOf(AuthenFailed)
    }
    await expect(otp.verifyChallenge('reset@example.com', issuanceId, next)).resolves.toBeUndefined()
  })

  test('a rewrite keeps the original lifetime', async () => {
    let now = 0
    const { context, mailer, otp } = makeOtpTestContext({ now: () => now })
    await context.configure().init()
    const issuanceId = await otp.issueChallenge('ttl@example.com')
    const next = otherCode(codeFrom(mailer.captured[0].text))

    now = (OTP_TTL_SECONDS - 100) * 1000
    expect(await otp.rewriteChallenge!('ttl@example.com', issuanceId, next)).toBe(true)
    now = OTP_TTL_SECONDS * 1000 + 1
    await expect(otp.verifyChallenge('ttl@example.com', issuanceId, next)).rejects.toBeInstanceOf(AuthenFailed)
  })

  test('refuses another address, a malformed code and a missing issuance', async () => {
    const { context, mailer, otp } = makeOtpTestContext()
    await context.configure().init()
    const issuanceId = await otp.issueChallenge('owner@example.com')
    const mailed = codeFrom(mailer.captured[0].text)
    const next = otherCode(mailed)

    expect(await otp.rewriteChallenge!('intruder@example.com', issuanceId, next)).toBe(false)
    for (const malformed of ['12345', '1234567', 'abcdef', ' 123456', '12345a']) {
      expect(await otp.rewriteChallenge!('owner@example.com', issuanceId, malformed)).toBe(false)
    }
    expect(await otp.rewriteChallenge!('owner@example.com', 'no-such-issuance', next)).toBe(false)
    await expect(otp.verifyChallenge('owner@example.com', issuanceId, mailed)).resolves.toBeUndefined()
  })
})
