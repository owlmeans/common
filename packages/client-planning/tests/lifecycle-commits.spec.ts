import { describe, expect, test } from 'bun:test'
import { CommitTimeout, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import { makePlanningResourceFeed } from '../src/index.js'
import { makeSuite, protocols, STORY, tick } from './context.js'
import { makeBarrier } from './lifecycle/context.js'

describe('@owlmeans/client-planning — commit cancellation', () => {
  test('rejects delayed status and held replies, and never retries a stale failed hold', async () => {
    for (const mode of ['status', 'hold', 'failed-hold'] as const) {
      let identity = 'a'
      let active = false
      const started = makeBarrier()
      const reply = makeBarrier()
      const suite = await makeSuite({ sync: false, schemas: false, scopeKey: () => identity,
        before: async request => { if (active && request.alias === protocols.commit.get.alias && Number((request.query as Record<string, unknown>)?.wait) > 0) { void started.hold() } },
        after: async call => {
          if (!active || call.alias !== protocols.commit.get.alias || (mode === 'status') !== (Number(call.query.wait) === 0)) return
          await reply.hold()
          if (mode === 'failed-hold') throw new Error('Carrier dropped after close')
        },
      })
      const project = await suite.project()
      const receipt = await suite.planning.execute({ action: TransitionAction.Create, card: { kind: WorkcardKind.Card, type: STORY, parent: project.id!, title: 'Delayed old card' } })
      active = true
      const waiting = receipt.committed({ timeout: 5000 })
      void waiting.catch(() => {})
      if (mode !== 'status') { await started.entered; await suite.store.flush() }
      await reply.entered
      await suite.client.planning().close()
      await expect(waiting).rejects.toThrow('scope-changed')
      identity = 'b'
      const count = suite.calls.length
      reply.release(); started.release()
      await tick(10)
      expect(suite.calls.length).toBe(count)
      expect((await suite.client.planningStores!().cards.list({}, { size: 0 })).items).toEqual([])
      expect((await suite.client.planningStores!().commits.list({}, { size: 0 })).items).toEqual([])
      await suite.client.planning().close()
    }
  })

  test('a deadline also bounds an unresolved socket opener and an initial status RPC', async () => {
    for (const socket of [true, false]) {
      const pause = makeBarrier()
      const suite = await makeSuite({ schemas: false, socket,
        opening: async () => await pause.hold(),
        after: async call => { if (!socket && call.alias === protocols.commit.get.alias) await pause.hold() },
      })
      const project = await suite.project()
      const waiting = suite.planning.commits.wait((await suite.local.transitions.list({ card: project.id! })).items[0]!.id!, { timeout: 40 })
      void waiting.catch(() => {})
      await pause.entered
      await expect(waiting).rejects.toBeInstanceOf(CommitTimeout)
      await suite.client.planning().close()
      pause.release()
      await tick()
      expect(suite.client.planning().commits.connected()).toBe(false)
    }
  })

  test('a new organization works after close while a late old reply cannot enter its mirror', async () => {
    let identity = 'organization-a'
    const pause = makeBarrier()
    let delay = false
    const suite = await makeSuite({ resources: true, schemas: false, entityId: () => identity, scopeKey: () => identity,
      after: async call => { if (delay && call.alias === protocols.commit.get.alias) await pause.hold() },
    })
    const project = await suite.project()
    delay = true
    let invalidations = 0
    suite.client.planning().lifecycle.onInvalidate(() => { invalidations++ })
    const old = suite.planning.commits.wait((await suite.local.transitions.list({ card: project.id! })).items[0]!.id!, { timeout: 5000 })
    void old.catch(() => {})
    await pause.entered
    await suite.client.planning().close()
    await expect(old).rejects.toThrow('scope-changed')
    expect(invalidations).toBe(1)
    identity = 'organization-b'
    await suite.client.planning().loadSchemas()
    const feed = makePlanningResourceFeed(suite.client, { teams: { size: 0 }, refresh: 0 })
    await feed.ready
    expect(feed.seeded).toBe(true)
    expect(invalidations).toBe(1)
    const fresh = await suite.planning.teams.create({ name: 'Organization B', fields: {} })
    pause.release()
    await tick(10)
    expect((await suite.client.planningStores!().teams.list({}, { size: 0 })).items.map(team => team.id)).toEqual([fresh.id])
    expect((await suite.client.planningStores!().cards.list({}, { size: 0 })).items).toEqual([])
    expect((await suite.local.teams.list()).items).toEqual([])
    await suite.client.planning().close()
  })
})
