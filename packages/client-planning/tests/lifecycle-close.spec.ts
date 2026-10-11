import { describe, expect, test } from 'bun:test'
import { TransitionAction, WorkcardKind } from '@owlmeans/planning'
import type { TransitionReceipt } from '@owlmeans/planning'
import { makeSuite, STORY, tick } from './context.js'
import { makeBarrier, pauseStoreRead } from './lifecycle/context.js'

describe('@owlmeans/client-planning — draining an authenticated close', () => {
  test('drains admitted receipt and auxiliary folds, rejects mid-close RPCs and leaves no late rows', async () => {
    for (const kind of ['card', 'team', 'commit'] as const) {
      const suite = await makeSuite({ schemas: false, resources: true, sync: kind !== 'commit' })
      const stores = suite.client.planningStores!()
      const project = await suite.project()
      let pending: TransitionReceipt | undefined
      if (kind === 'commit') {
        pending = await suite.planning.execute({ action: TransitionAction.Create, card: { kind: WorkcardKind.Card, type: STORY, parent: project.id!, title: 'Old commit' } })
        await suite.store.flush()
      }
      const pause = kind === 'team' ? pauseStoreRead(stores.teams) : pauseStoreRead(stores.cards)
      const writing = kind === 'commit' ? pending!.committed() : kind === 'card'
        ? suite.planning.execute({ action: TransitionAction.Create, card: { kind: WorkcardKind.Card, type: STORY, parent: project.id!, title: 'Old card' } })
        : suite.planning.teams.create({ name: 'Old team', fields: {} })
      void writing.catch(() => {})
      await pause.entered
      let done = false
      const closing = suite.client.planning().close().then(() => { done = true })
      const again = suite.client.planning().close()
      const calls = suite.calls.length
      await expect(suite.planning.teams.create({ name: 'During close', fields: {} })).rejects.toThrow('scope-changed')
      expect(suite.calls.length).toBe(calls)
      await tick()
      expect(done).toBe(false)
      pause.release()
      await Promise.all([closing, again])
      await expect(writing).rejects.toThrow('scope-changed')
      pause.restore()
      for (const store of Object.values(stores)) expect((await store.list({}, { size: 0 })).items).toEqual([])
      const fresh = await suite.planning.teams.create({ name: 'After close', fields: {} })
      expect((await stores.teams.get(fresh.id!)).name).toBe('After close')
      await suite.client.planning().close()
    }
  })

  test('a failed clear blocks fresh work until an explicit retry clears the actual stores', async () => {
    let identity = 'a'
    const suite = await makeSuite({ resources: true, schemas: false, scopeKey: () => identity })
    const stores = suite.client.planningStores!()
    const old = await suite.planning.teams.create({ name: 'Kept on failure', fields: {} })
    const remove = stores.teams.delete.bind(stores.teams)
    let fail = true
    stores.teams.delete = async (...args) => { if (fail) throw new Error('Storage unavailable'); return await remove(...args) }
    await expect(suite.client.planning().close()).rejects.toThrow('Storage unavailable')
    const calls = suite.calls.length
    await expect(suite.planning.teams.get(old.id!)).rejects.toThrow('scope-changed')
    expect(suite.calls.length).toBe(calls)
    expect((await stores.teams.get(old.id!)).name).toBe('Kept on failure')
    identity = 'b'
    await expect(suite.planning.teams.list()).rejects.toThrow('scope-changed')
    expect(suite.calls.length).toBe(calls)
    fail = false
    await suite.client.planning().close()
    expect(await stores.teams.load(old.id!)).toBeNull()
    expect((await suite.planning.teams.create({ name: 'Recovered', fields: {} })).name).toBe('Recovered')
    stores.teams.delete = remove
    await suite.client.planning().close()
  })

  test('a cached committed receipt is invalid after close while the server write remains committed', async () => {
    let identity = 'a'
    const suite = await makeSuite({ schemas: false, scopeKey: () => identity })
    const project = await suite.project()
    const receipt = await suite.planning.execute({ action: TransitionAction.Create, card: { kind: WorkcardKind.Card, type: STORY, parent: project.id!, title: 'Committed' } })
    await suite.client.planning().close()
    identity = 'b'
    await expect(receipt.committed()).rejects.toThrow('scope-changed')
    expect((await suite.local.cards.get(receipt.card!.id!)).title).toBe('Committed')
    await suite.client.planning().close()
  })

  test('successive identities each clear after prior admitted writes without accepting the middle generation', async () => {
    let identity = 'organization-a'
    const suite = await makeSuite({ resources: true, schemas: false, scopeKey: () => identity, entityId: () => identity })
    const stores = suite.client.planningStores!()
    await suite.planning.teams.create({ name: 'A', fields: {} })
    const pause = makeBarrier()
    const remove = stores.teams.delete.bind(stores.teams)
    stores.teams.delete = async (...args) => { await pause.hold(); return await remove(...args) }
    identity = 'organization-b'
    suite.client.planning().scopeKey()
    await pause.entered
    const middle = suite.planning.teams.create({ name: 'B', fields: {} })
    void middle.catch(() => {})
    await tick()
    identity = 'organization-c'
    const fresh = suite.planning.teams.create({ name: 'C', fields: {} })
    pause.release()
    await expect(middle).rejects.toThrow('scope-changed')
    const team = await fresh
    expect((await stores.teams.list({}, { size: 0 })).items.map(row => row.id)).toEqual([team.id])
    expect(team.name).toBe('C')
    stores.teams.delete = remove
    await suite.client.planning().close()
  })
})
