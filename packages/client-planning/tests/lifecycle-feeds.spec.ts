import { describe, expect, test } from 'bun:test'
import { CommitState, PLANNING_COMMIT_EVENT, TransitionAction } from '@owlmeans/planning'
import type { Connection } from '@owlmeans/socket'
import { makePlanningFeed, makePlanningResourceFeed } from '../src/index.js'
import { makeSuite, protocols, tick } from './context.js'
import { makeBarrier } from './lifecycle/context.js'

describe('@owlmeans/client-planning — feed boundaries', () => {
  test('stops both feed kinds without waiting for an unresolved seed, preserving fresh organization rows', async () => {
    for (const kind of ['cards', 'teams'] as const) {
      let identity = 'organization-a'
      const pause = makeBarrier()
      const suite = await makeSuite({ schemas: false, resources: true, entityId: () => identity, scopeKey: () => identity,
        after: async call => { if (kind === 'cards' ? call.alias === protocols.card.list.alias : call.alias.endsWith(':teams:list')) await pause.hold() },
      })
      await suite.project()
      await suite.local.teams.create({ name: 'Old team', fields: {} })
      let notifications = 0
      const feed = kind === 'cards'
        ? makePlanningFeed(suite.client, { onChange: () => { notifications++ } })
        : makePlanningResourceFeed(suite.client, { teams: { size: 0 }, refresh: 0, onChange: () => { notifications++ } })
      await pause.entered
      await suite.client.planning().close()
      await feed.ready
      const count = notifications
      identity = 'organization-b'
      const fresh = await suite.planning.teams.create({ name: 'New organization', fields: {} })
      pause.release(); await tick(10)
      expect(notifications).toBe(count)
      expect(feed.seeded).toBe(false)
      expect((await suite.client.planningStores!().cards.list({}, { size: 0 })).items).toEqual([])
      expect((await suite.client.planningStores!().teams.list({}, { size: 0 })).items.map(team => team.id)).toEqual([fresh.id])
      await suite.client.planning().close()
    }
  })

  test('drains admitted authoritative deletions before clearing and rejects an old queued reconcile', async () => {
    const suite = await makeSuite({ schemas: false })
    const project = await suite.project()
    const card = await suite.story(project.id!)
    const stores = suite.client.planningStores!()
    const feed = makePlanningFeed(suite.client, { query: { parent: project.id } })
    await feed.ready
    await suite.local.execute({ action: TransitionAction.Delete, card: card.id! }, { wait: true })
    const pause = makeBarrier()
    const purge = stores.cards.purge.bind(stores.cards)
    stores.cards.purge = async (...args) => { await pause.hold(); return await purge(...args) }
    const refreshing = feed.refresh()
    await pause.entered
    const queued = feed.refresh()
    let stopped = false
    const closing = suite.client.planning().close().then(() => { stopped = true })
    await tick()
    expect(stopped).toBe(false)
    pause.release()
    await Promise.all([closing, refreshing, queued])
    stores.cards.purge = purge
    expect((await stores.cards.list({}, { size: 0 })).items).toEqual([])
    const fresh = await suite.planning.cards.get(project.id!)
    await stores.cards.save(fresh)
    await feed.refresh()
    expect(await stores.cards.load(project.id!)).not.toBeNull()
    await suite.client.planning().close()
  })

  test('a recordless socket frame never holds the mutation queue over its card RPC', async () => {
    const pause = makeBarrier()
    let delay = false
    let carrier: Connection | undefined
    const suite = await makeSuite({ schemas: false, socket: true, opening: async connection => { carrier = connection },
      after: async call => { if (delay && call.alias === protocols.card.get.alias) await pause.hold() },
    })
    const project = await suite.project()
    const card = await suite.story(project.id!)
    const feed = makePlanningFeed(suite.client, { query: { parent: project.id } })
    await feed.ready
    await suite.local.execute({ action: TransitionAction.Update, card: card.id!, changes: { title: 'Updated on server' } }, { wait: true })
    await tick()
    const wire = structuredClone(suite.frames.find((frame: any) => frame.event === PLANNING_COMMIT_EVENT && frame.payload?.card === card.id && frame.payload.state === CommitState.Committed)) as { payload: { record?: unknown } }
    expect(wire).toBeDefined()
    delete wire.payload.record
    delay = true
    const receiving = carrier!.receive(JSON.stringify(wire))
    await pause.entered
    await suite.client.planning().close()
    await receiving
    pause.release(); await tick()
    expect((await suite.client.planningStores!().cards.list({}, { size: 0 })).items).toEqual([])
    expect((await suite.client.planningStores!().commits.list({}, { size: 0 })).items).toEqual([])
    await feed.stop()
  })
})
