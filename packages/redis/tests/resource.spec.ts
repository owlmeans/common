import { afterAll, describe, expect, test } from 'bun:test'
import { gate, makeSuite } from './context.js'

/**
 * `delete` / `take` coverage.
 *
 * Both drop the key with GETDEL and hand back what was under it; they differ only in what an
 * absent id means — `delete` answers `null`, `take` throws. The by-id form carries the whole
 * contract: a `delete(id)` that returns without touching redis leaves consumed OTP codes alive
 * in the store and turns the next `create` under that id into `RecordExists`.
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

  test('removes the record when called by id', async () => {
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

  test('take hands back the record it removed', async () => {
    const { resource } = await suite.boot()
    await resource.create({ id: 'taken', value: 'once' })

    expect(await resource.take('taken')).toMatchObject({ value: 'once' })
    expect(await resource.load('taken')).toBeNull()
  })

  test('take throws for an id that is not there', async () => {
    const { resource } = await suite.boot()

    await expect(resource.take('never-taken')).rejects.toThrow()
  })

  test('create refuses an id that is already taken', async () => {
    const { resource } = await suite.boot()
    await resource.create({ id: 'occupied', value: 'first' })

    await expect(resource.create({ id: 'occupied', value: 'second' })).rejects.toThrow()
  })
})
