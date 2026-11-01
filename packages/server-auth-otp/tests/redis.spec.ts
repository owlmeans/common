import { afterAll, describe, expect, test } from 'bun:test'
import { AuthenFailed } from '@owlmeans/auth'
import { codeFrom, makeRedisOtpSuite, otherCode, redisGate, TEARDOWN_TIMEOUT } from './context.js'

const wrongFor = (code: string): string => code === '000000' ? '999999' : '000000'

describe('@owlmeans/server-auth-otp — Redis challenge store rewrite', () => {
  if (redisGate.skip) {
    test.skip(redisGate.reason ?? 'redis gate closed', () => { })
    return
  }

  const suite = makeRedisOtpSuite('otp_rewrite')

  afterAll(async () => {
    await suite.teardown()
  }, TEARDOWN_TIMEOUT)

  test('keeps the remaining TTL, swaps the code and resets the failed attempts', async () => {
    const { otp, mailer, pttl } = await suite.boot()
    const email = 'ttl@example.com'
    const issuanceId = await otp.issueChallenge(email)
    const mailed = codeFrom(mailer.captured[0].text)
    const next = otherCode(mailed)

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(otp.verifyChallenge(email, issuanceId, wrongFor(next))).rejects.toBeInstanceOf(AuthenFailed)
    }
    const before = await pttl(issuanceId)
    await Bun.sleep(1_100)
    expect(await otp.rewriteChallenge!(email, issuanceId, next)).toBe(true)
    const after = await pttl(issuanceId)

    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThanOrEqual(before - 1_000)
    // Four guesses before the rewrite and four after (the mailed code among them) would exhaust an
    // issuance whose counter was not reset.
    await expect(otp.verifyChallenge(email, issuanceId, mailed)).rejects.toBeInstanceOf(AuthenFailed)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(otp.verifyChallenge(email, issuanceId, wrongFor(next))).rejects.toBeInstanceOf(AuthenFailed)
    }
    await expect(otp.verifyChallenge(email, issuanceId, next)).resolves.toBeUndefined()
  }, 15_000)

  test('refuses another address and a missing issuance, leaving the challenge as it was', async () => {
    const { otp, mailer, pttl } = await suite.boot()
    const issuanceId = await otp.issueChallenge('owner@example.com')
    const mailed = codeFrom(mailer.captured[0].text)
    const next = otherCode(mailed)

    expect(await otp.rewriteChallenge!('intruder@example.com', issuanceId, next)).toBe(false)
    expect(await otp.rewriteChallenge!('owner@example.com', 'no-such-issuance', next)).toBe(false)
    expect(await pttl('no-such-issuance')).toBe(-2)
    await expect(otp.verifyChallenge('owner@example.com', issuanceId, mailed)).resolves.toBeUndefined()
  }, 15_000)
})
