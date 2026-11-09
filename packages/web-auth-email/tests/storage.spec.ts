import { describe, expect, test } from 'bun:test'
import { EMAIL_DEVICE_ID_PATTERN, EMAIL_OFFER_TTL_SECONDS } from '@owlmeans/auth-email'
import { EMAIL_DEVICE_STORAGE, EMAIL_OFFER_STORAGE } from '../src/consts.js'
import { createEmailStorageHelper } from '../src/storage.js'
import { counting, memoryArea } from './helpers.js'

const valid = new RegExp(EMAIL_DEVICE_ID_PATTERN)

describe('emailStorageHelper — device id', () => {
  test('creates 16 random bytes as 22 base64url characters, kept in localStorage', () => {
    const local = memoryArea()
    const helper = createEmailStorageHelper({ local: () => local, random: counting(250) })

    const id = helper.deviceId()
    expect(id).toHaveLength(22)
    expect(id).toMatch(valid)
    expect(id).not.toMatch(/[+/=]/)
    expect(local.data.get(EMAIL_DEVICE_STORAGE)).toBe(id)
  })

  test('reuses the stored id, across helpers (a later page load)', () => {
    const local = memoryArea()
    const first = createEmailStorageHelper({ local: () => local, random: counting(1) }).deviceId()
    const again = createEmailStorageHelper({ local: () => local, random: counting(99) }).deviceId()

    expect(again).toBe(first)
  })

  test('replaces a stored value that is not a device id', () => {
    const local = memoryArea()
    local.data.set(EMAIL_DEVICE_STORAGE, 'not a device id')
    const id = createEmailStorageHelper({ local: () => local, random: counting(7) }).deviceId()

    expect(id).toMatch(valid)
    expect(local.data.get(EMAIL_DEVICE_STORAGE)).toBe(id)
  })

  test('without storage, one ephemeral id for the life of the page', () => {
    let calls = 0
    const random = (count: number) => { calls++; return counting(calls)(count) }
    const refusing = createEmailStorageHelper({ local: () => memoryArea(true), random })
    const absent = createEmailStorageHelper({ local: () => null, random })

    expect(refusing.deviceId()).toMatch(valid)
    expect(refusing.deviceId()).toBe(refusing.deviceId())
    expect(absent.deviceId()).toBe(absent.deviceId())
    expect(calls).toBe(2)
  })
})

describe('emailStorageHelper — offer ticket', () => {
  test('keeps, reads and drops the ticket in sessionStorage', () => {
    const session = memoryArea()
    const helper = createEmailStorageHelper({ session: () => session })

    expect(helper.offer()).toBeNull()
    helper.keepOffer('ticket-1', 'account-1')
    expect(session.data.has(EMAIL_OFFER_STORAGE)).toBe(true)
    expect(helper.offer('account-1')).toBe('ticket-1')
    expect(helper.offer()).toBe('ticket-1')
    helper.dropOffer()
    expect(helper.offer('account-1')).toBeNull()
  })

  test('an expired ticket, or another account\'s, is no offer', () => {
    const session = memoryArea()
    let now = 1_000_000
    const helper = createEmailStorageHelper({ session: () => session, now: () => now })

    helper.keepOffer('ticket-2', 'account-2')
    expect(helper.offer('someone-else')).toBeNull()
    now += EMAIL_OFFER_TTL_SECONDS * 1000
    expect(helper.offer('account-2')).toBeNull()
  })

  test('a browser that refuses storage keeps no offer and throws nothing', () => {
    const helper = createEmailStorageHelper({ session: () => memoryArea(true) })

    expect(() => helper.keepOffer('ticket-3')).not.toThrow()
    expect(helper.offer()).toBeNull()
    expect(() => helper.dropOffer()).not.toThrow()
  })
})
