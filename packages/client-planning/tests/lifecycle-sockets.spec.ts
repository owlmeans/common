import { describe, expect, test } from 'bun:test'
import { makeSuite, tick } from './context.js'
import { makeBarrier } from './lifecycle/context.js'

describe('@owlmeans/client-planning — socket generations', () => {
  test('closes a late carrier and never restores its old subscription over a fresh connection', async () => {
    const pause = makeBarrier()
    let staleCloses = 0
    const suite = await makeSuite({ schemas: false, socket: true, opening: async (connection, attempt) => {
      if (attempt !== 1) return
      const close = connection.close.bind(connection)
      connection.close = async () => { staleCloses++; await close() }
      await pause.hold()
    } })
    const source = suite.client.planning().commits
    let oldCalls = 0, newCalls = 0
    const old = source.subscribe(() => { oldCalls++ })
    void Promise.resolve(old).catch(() => {})
    await pause.entered
    await source.close()
    await expect(Promise.resolve(old)).rejects.toThrow('scope-changed')
    const stop = await source.subscribe(() => { newCalls++ })
    pause.release(); await tick(10)
    expect(staleCloses).toBe(1)
    expect(source.connected()).toBe(true)
    await suite.project()
    await tick(10)
    expect(oldCalls).toBe(0)
    expect(newCalls).toBeGreaterThan(0)
    stop(); await suite.client.planning().close()
  })

  test('a stale opener failure cannot discard a new pending opener or duplicate its connection', async () => {
    const oldPause = makeBarrier(), newPause = makeBarrier()
    const suite = await makeSuite({ schemas: false, socket: true, opening: async (_connection, attempt) => {
      if (attempt === 1) { await oldPause.hold(); throw new Error('Old carrier failed') }
      if (attempt === 2) await newPause.hold()
    } })
    const source = suite.client.planning().commits
    const old = source.subscribe(() => {})
    void Promise.resolve(old).catch(() => {})
    await oldPause.entered; await source.close()
    await expect(Promise.resolve(old)).rejects.toThrow('scope-changed')
    const next = source.subscribe(() => {})
    await newPause.entered
    oldPause.release(); await tick()
    const joined = source.subscribe(() => {})
    await tick()
    expect(suite.sockets()).toBe(2)
    newPause.release()
    const stops = await Promise.all([next, joined])
    expect(source.connected()).toBe(true)
    stops.forEach(stop => stop())
    await suite.client.planning().close()
  })

  test('close cancels an in-progress dispatch snapshot before it invokes another old listener', async () => {
    const pause = makeBarrier()
    const suite = await makeSuite({ schemas: false, socket: true })
    const source = suite.client.planning().commits
    let later = 0
    await source.subscribe(async () => await pause.hold())
    await source.subscribe(() => { later++ })
    const writing = suite.project()
    await pause.entered
    await source.close()
    pause.release(); await writing; await tick()
    expect(later).toBe(0)
    let fresh = 0
    const stop = await source.subscribe(() => { fresh++ })
    await suite.project('Fresh connection'); await tick()
    expect(fresh).toBeGreaterThan(0)
    expect(later).toBe(0)
    stop(); await suite.client.planning().close()
  })
})
