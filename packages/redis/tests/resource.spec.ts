import { afterAll, describe, expect, test } from 'bun:test'
import { gate, makeSuite } from './context.js'

/**
 * `delete` regression coverage.
 *
 * The by-id form silently did nothing: `delete(id, opts)` only loaded the record when `id`
 * was an object or `opts` was a field name, so the plain `delete(id)` every caller uses fell
 * through to `record == null` and returned before touching redis. It surfaced as
 * `RecordExists` on the second email-OTP request for one address inside the code's TTL —
 * `issueChallenge` upserts by deleting first — and left consumed codes alive in the store.
 */
describe('@owlmeans/redis — resource delete', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'redis gate closed', () => { })
    return
  }

  const suite = makeSuite('delete')

  afterAll(async () => {
    await suite.teardown()
  })

  test('removes the record when called by id alone', async () => {
    const { resource } = await suite.boot()
    await resource.create({ id: 'by-id', value: 'first' })

    expect(await resource.delete('by-id')).toMatchObject({ id: 'by-id' })
    expect(await resource.load('by-id')).toBeNull()
  })

  test('returns null for an id that is not there', async () => {
    const { resource } = await suite.boot()

    expect(await resource.delete('never-created')).toBeNull()
  })

  test('lets delete-then-create re-issue under the same id — the OTP upsert', async () => {
    const { resource } = await suite.boot()
    await resource.create({ id: 'otp', value: 'first-code' }, { ttl: 600 })

    await resource.delete('otp')
    await resource.create({ id: 'otp', value: 'second-code' }, { ttl: 600 })

    expect((await resource.load('otp'))?.value).toBe('second-code')
  })

  test('removes the record when handed the record itself', async () => {
    const { resource } = await suite.boot()
    const record = await resource.create({ id: 'by-record', value: 'x' })

    expect(await resource.delete(record)).toMatchObject({ id: 'by-record' })
    expect(await resource.load('by-record')).toBeNull()
  })
})
