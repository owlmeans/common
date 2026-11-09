import { describe, expect, test } from 'bun:test'
import { EMAIL_OFFER_TTL_SECONDS } from '@owlmeans/auth-email'
import { makeEmailDeviceStore } from '../src/devices.js'
import { emailAuthKeyHelper } from '../src/keys.js'
import { makeMemoryOfferTickets } from '../src/tickets.js'
import { DEVICE_A, DEVICE_B, makeEmailAuthFixture } from './context.js'

const deviceOf = (index: number): string => `device-${String(index).padStart(15, '0')}-xx`

describe('@owlmeans/server-auth-email — remembered devices', () => {
  test('the 11th device evicts the least recently seen one', async () => {
    const env = await makeEmailAuthFixture()
    const devices = makeEmailDeviceStore(env.context)
    const now = Date.now()
    for (let index = 0; index < 10; index += 1) {
      const seen = new Date(now - (10 - index) * 60_000)
      await env.devices().create({
        accountId: 'acc', key: emailAuthKeyHelper.deviceKey('acc', deviceOf(index)),
        createdAt: seen, lastSeenAt: seen, expiresAt: new Date(now + 86_400_000),
      })
    }

    await devices.remember('acc', deviceOf(10))

    const { items } = await env.devices().list({ accountId: 'acc' })
    expect(items).toHaveLength(10)
    expect(await devices.known('acc', deviceOf(0))).toBe(false)
    expect(await devices.known('acc', deviceOf(1))).toBe(true)
    expect(await devices.known('acc', deviceOf(10))).toBe(true)
  })

  test('a device past its expiresAt is not known, even before any sweep; a sign-in refreshes it', async () => {
    const env = await makeEmailAuthFixture()
    const devices = makeEmailDeviceStore(env.context, { ttlDays: 30 })
    const past = new Date(Date.now() - 1_000)
    await env.devices().create({
      accountId: 'acc', key: emailAuthKeyHelper.deviceKey('acc', DEVICE_A), createdAt: past, lastSeenAt: past, expiresAt: past,
    })

    expect(await devices.known('acc', DEVICE_A)).toBe(false)
    await devices.remember('acc', DEVICE_A)
    expect(await devices.known('acc', DEVICE_A)).toBe(true)
    const [record] = (await env.devices().list({ accountId: 'acc' })).items
    expect(record!.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000)
  })

  test('forgetting the others keeps the current device and touches no other account', async () => {
    const env = await makeEmailAuthFixture()
    const devices = makeEmailDeviceStore(env.context)
    await devices.remember('acc', DEVICE_A)
    await devices.remember('acc', DEVICE_B)
    await devices.remember('other', DEVICE_B)

    expect(await devices.forgetOthers('acc', DEVICE_A)).toBe(1)
    expect(await devices.known('acc', DEVICE_A)).toBe(true)
    expect(await devices.known('acc', DEVICE_B)).toBe(false)
    expect(await devices.known('other', DEVICE_B)).toBe(true)
  })
})

describe('@owlmeans/server-auth-email — offer tickets (memory)', () => {
  test('single use, bound to the account, gone after its lifetime', async () => {
    let now = 0
    const tickets = makeMemoryOfferTickets(() => now)

    const ticket = await tickets.issue('acc')
    expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(await tickets.spend(ticket, 'other')).toBe(false)
    expect(await tickets.spend(ticket, 'acc')).toBe(true)
    expect(await tickets.spend(ticket, 'acc')).toBe(false)

    const late = await tickets.issue('acc')
    now += EMAIL_OFFER_TTL_SECONDS * 1000
    expect(await tickets.spend(late, 'acc')).toBe(false)
  })
})
