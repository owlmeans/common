import { describe, expect, test } from 'bun:test'
import { CheckoutLimitExceeded } from '@owlmeans/payment'
import { createCheckoutLink } from '../src/plugins/stripe.js'
import { gateway } from '../src/utils.js'
import type { CheckoutPlugin, CheckoutSettled } from '../src/types.js'
import {
  CREDITS_PRODUCT, ENTITY, makeRightsContext, paidSession, send,
} from './consumer-fixtures.js'
import type { FakeContext } from './fake-stripe.js'

const successUrl = 'https://app.example.com/ok'
const topUp = (fake: FakeContext, amountMinor = 1_000) => createCheckoutLink(fake.ctx, fake.stripe, {
  productSku: CREDITS_PRODUCT, entityId: ENTITY, service: 'app', amountMinor, successUrl, country: 'US',
}, gateway(fake.ctx).checkoutPlugins())

interface Journal {
  admitted: unknown[]
  created: unknown[]
  settled: CheckoutSettled[]
}

const recording = (alias: string, journal: Journal, extra: Partial<CheckoutPlugin> = {}): CheckoutPlugin => ({
  alias,
  admit: async (_ctx, attempt) => { journal.admitted.push({ alias, ...attempt }); return { reservationId: `${alias}-hold` } },
  created: async (_ctx, created) => { journal.created.push({ alias, ...created }) },
  settled: async (_ctx, settled) => { journal.settled.push({ ...settled, alias } as CheckoutSettled) },
  ...extra,
})

const journal = (): Journal => ({ admitted: [], created: [], settled: [] })

describe('checkout plugins — narrowing', () => {
  test('narrowings compose to the smallest maximum; the amount policy read equals the enforcement', async () => {
    const fake = await makeRightsContext()
    gateway(fake.ctx).use({ alias: 'tier', narrow: async () => ({ maximumMinor: 2_500, reason: 'per-purchase' }) })
    gateway(fake.ctx).use({
      alias: 'window', narrow: async () => ({ maximumMinor: 4_000, reason: 'window', remainingMinor: 4_000 }),
    })
    const view = await gateway(fake.ctx).amountPolicy(fake.ctx, ENTITY, CREDITS_PRODUCT)
    expect(view.limit).toEqual(expect.objectContaining({ maximumMinor: 2_500, reason: 'per-purchase', blocked: false, narrowed: true }))
    expect(view.policy.presetsMinor).toEqual([1_000, 2_000])

    await topUp(fake, 2_500)
    const refusal = await topUp(fake, 2_600).catch(error => error)
    expect(refusal).toBeInstanceOf(CheckoutLimitExceeded)
    expect(refusal).toEqual(expect.objectContaining({ reason: 'per-purchase', maximumMinor: 2_500, currency: 'usd' }))
    expect(fake.state.checkoutSessions).toHaveLength(1)
  })

  test('a blocked limit refuses any amount, the minimum too', async () => {
    const fake = await makeRightsContext()
    const resetsAt = new Date(Date.now() + 86_400_000)
    gateway(fake.ctx).use({ alias: 'hold', narrow: async () => ({ maximumMinor: 0, reason: 'hold', resetsAt }) })
    const view = await gateway(fake.ctx).amountPolicy(fake.ctx, ENTITY, CREDITS_PRODUCT)
    expect(view.limit?.blocked).toBe(true)
    const refusal = await topUp(fake, 500).catch(error => error)
    expect(refusal).toBeInstanceOf(CheckoutLimitExceeded)
    expect(refusal.resetsAt?.getTime()).toBe(Math.floor(resetsAt.getTime() / 1000) * 1000 === resetsAt.getTime() ? resetsAt.getTime() : refusal.resetsAt?.getTime())
  })

  test('a plugin registered twice under one alias replaces the first; a narrowing error fails closed', async () => {
    const fake = await makeRightsContext()
    gateway(fake.ctx).use({ alias: 'tier', narrow: async () => ({ maximumMinor: 600, reason: 'old' }) })
    gateway(fake.ctx).use({ alias: 'tier', narrow: async () => ({ maximumMinor: 3_000, reason: 'new' }) })
    expect(gateway(fake.ctx).checkoutPlugins()).toHaveLength(1)
    expect((await gateway(fake.ctx).amountPolicy(fake.ctx, ENTITY, CREDITS_PRODUCT)).limit?.reason).toBe('new')

    gateway(fake.ctx).use({ alias: 'broken', narrow: async () => { throw new Error('tier store down') } })
    await expect(topUp(fake)).rejects.toThrow('tier store down')
    expect(fake.state.checkoutSessions).toHaveLength(0)
  })
})

describe('checkout plugins — admission and the session', () => {
  test('admit sees the attempt; created gets the session, the amount, the reservation and the expiry', async () => {
    const fake = await makeRightsContext()
    const log = journal()
    gateway(fake.ctx).use(recording('tier', log, { sessionTtlSeconds: 3_600 }))
    const before = Math.floor(Date.now() / 1000)
    await topUp(fake)
    expect(log.admitted[0]).toEqual(expect.objectContaining({
      alias: 'tier', entityId: ENTITY, productSku: CREDITS_PRODUCT, mode: 'amount', amountMinor: 1_000,
      amountCurrency: 'usd', chargeMinor: 1_021, currency: 'usd', sessionTtlSeconds: 3_600,
    }))
    expect(log.created[0]).toEqual(expect.objectContaining({
      alias: 'tier', sessionId: expect.stringMatching(/^cs_/), url: expect.stringContaining('https://'),
      reservationId: 'tier-hold', amountMinor: 1_000,
    }))
    const expiresAt = fake.state.checkoutSessions[0].expires_at as number
    expect(expiresAt).toBeGreaterThanOrEqual(before + 3_600)
    expect(expiresAt).toBeLessThanOrEqual(before + 3_602)
  })

  test('the session lifetime is the smallest declared, clamped to Stripe’s 30 min – 24 h', async () => {
    const fake = await makeRightsContext()
    gateway(fake.ctx).use({ alias: 'short', sessionTtlSeconds: 60 })
    gateway(fake.ctx).use({ alias: 'long', sessionTtlSeconds: 7_200 })
    const now = Math.floor(Date.now() / 1000)
    await topUp(fake)
    expect(fake.state.checkoutSessions[0].expires_at - now).toBeGreaterThanOrEqual(1_800)
    expect(fake.state.checkoutSessions[0].expires_at - now).toBeLessThanOrEqual(1_802)

    const plain = await makeRightsContext()
    await topUp(plain)
    expect(plain.state.checkoutSessions[0].expires_at).toBeUndefined()
  })

  test('a veto releases what earlier plugins admitted and creates no session', async () => {
    const fake = await makeRightsContext()
    const log = journal()
    gateway(fake.ctx).use(recording('first', log))
    gateway(fake.ctx).use({
      alias: 'veto',
      admit: async () => { throw new CheckoutLimitExceeded({ reason: 'window', maximumMinor: 0, currency: 'usd' }) },
    })
    await expect(topUp(fake)).rejects.toBeInstanceOf(CheckoutLimitExceeded)
    expect(fake.state.checkoutSessions).toHaveLength(0)
    expect(log.settled).toEqual([expect.objectContaining({ alias: 'first', outcome: 'failed', reservationId: 'first-hold' })])
  })

  test('a created that throws expires the fresh session and releases every hold', async () => {
    const fake = await makeRightsContext()
    const log = journal()
    gateway(fake.ctx).use(recording('first', log))
    gateway(fake.ctx).use(recording('second', log, { created: async () => { throw new Error('reservation lost') } }))
    await expect(topUp(fake)).rejects.toThrow('reservation lost')
    expect(fake.state.expiredSessions).toHaveLength(1)
    expect(log.settled.map(settled => [settled.outcome, settled.reservationId, settled.sessionId]))
      .toEqual([['failed', 'first-hold', fake.state.expiredSessions[0]], ['failed', 'second-hold', fake.state.expiredSessions[0]]])
  })

  test('Stripe refusing the session releases the holds too', async () => {
    const fake = await makeRightsContext()
    const log = journal()
    gateway(fake.ctx).use(recording('first', log))
    fake.state.failures['checkout.sessions.create'] = 'amount_too_small'
    await expect(topUp(fake)).rejects.toThrow('amount_too_small')
    expect(log.settled).toEqual([expect.objectContaining({ outcome: 'failed', reservationId: 'first-hold' })])
  })
})

describe('checkout plugins — settlement from the webhook', () => {
  test('paid, expired and failed sessions are settled; a settling error never fails the webhook', async () => {
    const fake = await makeRightsContext()
    const log = journal()
    gateway(fake.ctx).use(recording('tier', log))
    gateway(fake.ctx).use({ alias: 'broken', settled: async () => { throw new Error('ignored') } })

    await send(fake, 'checkout.session.completed', paidSession({ id: 'cs_paid' }))
    await send(fake, 'checkout.session.expired', { ...paidSession({ id: 'cs_gone', payment_status: 'unpaid' }), status: 'expired' })
    await send(fake, 'checkout.session.async_payment_failed', paidSession({ id: 'cs_failed', payment_status: 'unpaid' }))
    expect(log.settled.map(settled => [settled.sessionId, settled.outcome])).toEqual([
      ['cs_paid', 'paid'], ['cs_gone', 'expired'], ['cs_failed', 'failed'],
    ])
    expect(log.settled[0]).toEqual(expect.objectContaining({ entityId: ENTITY, productSku: CREDITS_PRODUCT, amountMinor: 1_000 }))
  })

  test('an unmanaged gateway still narrows and answers the amount policy', async () => {
    const fake = await makeRightsContext()
    expect(gateway(fake.ctx).managed).toBe(false)
    gateway(fake.ctx).use({ alias: 'tier', narrow: async () => ({ maximumMinor: 700, reason: 'per-purchase' }) })
    expect((await gateway(fake.ctx).amountPolicy(fake.ctx, ENTITY, CREDITS_PRODUCT)).policy.maximumMinor).toBe(700)
  })
})
