import { afterAll, describe, expect, test } from 'bun:test'
import { EMAIL_OFFER_TTL_SECONDS } from '@owlmeans/auth-email'
import { OtpThrottled, OTP_THROTTLE_SERVICE } from '@owlmeans/server-auth-otp'
import { emailAuthKeyHelper } from '../src/keys.js'
import { makeEmailAuthThrottle } from '../src/throttle.js'
import { makeRedisOfferTickets } from '../src/tickets.js'
import { REDIS_TICKETS, TEARDOWN_TIMEOUT, makeRedisEmailAuthSuite, redisGate } from './context.js'

const suite = makeRedisEmailAuthSuite('email_auth')
const it = redisGate.skip ? test.skip : test

describe('@owlmeans/server-auth-email — Redis', () => {
  if (redisGate.skip) {
    test.skip(redisGate.reason ?? 'redis gate closed', () => {})

    return
  }

  afterAll(async () => { await suite.teardown() }, TEARDOWN_TIMEOUT)

  it('an offer ticket is single use, bound to its account and expires with its lifetime', async () => {
    const { context, resource } = await suite.boot()
    const tickets = makeRedisOfferTickets(context, REDIS_TICKETS)

    const ticket = await tickets.issue('acc-1')
    const key = resource.key(emailAuthKeyHelper.ticketKey(ticket))
    const ttl = await resource.db.client.pttl(key)
    expect(ttl).toBeGreaterThan((EMAIL_OFFER_TTL_SECONDS - 5) * 1000)
    expect(ttl).toBeLessThanOrEqual(EMAIL_OFFER_TTL_SECONDS * 1000)
    expect(await resource.db.client.get(key)).toBe('acc-1')

    expect(await tickets.spend(ticket, 'acc-2')).toBe(false)
    expect(await tickets.spend(ticket, 'acc-1')).toBe(true)
    expect(await tickets.spend(ticket, 'acc-1')).toBe(false)
    expect(await resource.db.client.exists(key)).toBe(0)
  }, 30_000)

  it('throttles through the Redis throttle service under keys that never hold the address', async () => {
    const { context, resource } = await suite.boot()
    const throttle = makeEmailAuthThrottle(context, { throttleAlias: OTP_THROTTLE_SERVICE })

    await throttle.consume('pinEmail', 'Redis.Person@example.org')
    expect(await throttle.consume('pinEmail', 'redis.person@example.org').catch(error => error)).toBeInstanceOf(OtpThrottled)

    const [, keys] = await resource.db.client.scan('0', 'MATCH', `${resource.key()}`, 'COUNT', 10_000)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.join(' ')).not.toContain('redis.person')
  }, 30_000)
})
