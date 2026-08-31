import { afterAll, describe, expect, test } from 'bun:test'
import { gate, makeSuite } from './context.js'

/**
 * TTL regression coverage.
 *
 * The absolute (`Date`) form was sent to EXPIREAT as `Date.getTime()` — milliseconds against a
 * command that reads seconds — so the expiry landed ~50 millennia out and the record never
 * expired. Asserting the redis-side TTL rather than the call is the whole point here: the buggy
 * version still "set an expiry", just not one that would ever arrive.
 */
describe('@owlmeans/redis — resource ttl', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'redis gate closed', () => { })
    return
  }

  const suite = makeSuite('ttl')
  /** Generous: the assertion is about the order of magnitude, not clock precision. */
  const tolerance = 5_000

  afterAll(async () => {
    await suite.teardown()
  })

  test('a number TTL is seconds from now', async () => {
    const { resource } = await suite.boot()
    await resource.create({ id: 'seconds', value: 'x' }, { ttl: 600 })

    const remaining = await resource.db.client.pttl(resource.key('seconds'))

    expect(remaining).toBeGreaterThan(600_000 - tolerance)
    expect(remaining).toBeLessThanOrEqual(600_000)
  })

  test('a Date TTL is the absolute instant to expire at', async () => {
    const { resource } = await suite.boot()
    const expiresAt = new Date(Date.now() + 600_000)
    await resource.create({ id: 'absolute', value: 'x' }, { ttl: expiresAt })

    const remaining = await resource.db.client.pttl(resource.key('absolute'))

    expect(remaining).toBeGreaterThan(600_000 - tolerance)
    expect(remaining).toBeLessThanOrEqual(600_000)
  })

  test('update renews the expiry the same way', async () => {
    const { resource } = await suite.boot()
    await resource.create({ id: 'renewed', value: 'first' }, { ttl: 5 })
    await resource.update({ id: 'renewed', value: 'second' }, { ttl: new Date(Date.now() + 600_000) })

    const remaining = await resource.db.client.pttl(resource.key('renewed'))

    expect(remaining).toBeGreaterThan(600_000 - tolerance)
    expect(remaining).toBeLessThanOrEqual(600_000)
  })

  test('a Date in the past drops the record immediately', async () => {
    const { resource } = await suite.boot()
    await resource.create({ id: 'stale', value: 'x' }, { ttl: new Date(Date.now() - 1_000) })

    expect(await resource.load('stale')).toBeNull()
  })

  test('no TTL leaves the record persistent', async () => {
    const { resource } = await suite.boot()
    await resource.create({ id: 'forever', value: 'x' })

    // redis reports -1 for a key that exists with no expiry.
    expect(await resource.db.client.pttl(resource.key('forever'))).toBe(-1)
  })
})
