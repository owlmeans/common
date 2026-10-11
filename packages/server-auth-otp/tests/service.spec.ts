import { describe, expect, test } from 'bun:test'
import { AuthenFailed } from '@owlmeans/auth'
import { OtpThrottled } from '../src/errors.js'
import { codeFrom, makeOtpTestContext } from './context.js'

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
