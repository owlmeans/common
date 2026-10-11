import { describe, expect, test } from 'bun:test'
import { makePlanningFeed } from '../src/index.js'
import { makeSuite, tick } from './context.js'

describe('@owlmeans/client-planning — the feed', () => {
  test('seeds the mirror from the list, then folds every commit the socket pushes', async () => {
    const suite = await makeSuite({ socket: true })
    const stores = suite.client.planningStores!()
    const project = await suite.project()
    const first = await suite.story(project.id!, 'Seeded')

    const feed = makePlanningFeed(suite.client, { query: { parent: project.id }, filter: { project: project.id } })
    await feed.ready
    expect(feed.seeded).toBe(true)
    expect(feed.connected).toBe(true)
    expect((await stores.cards.get(first.id!)).title).toBe('Seeded')

    const second = await suite.story(project.id!, 'Pushed')
    await tick(20)
    expect((await stores.cards.get(second.id!)).title).toBe('Pushed')

    await feed.stop()
  })

  test('stop() ends the folding and leaves the shared socket open', async () => {
    const suite = await makeSuite({ socket: true })
    const stores = suite.client.planningStores!()
    const project = await suite.project()

    const feed = makePlanningFeed(suite.client, { query: { parent: project.id } })
    await feed.ready
    await feed.stop()

    const late = await suite.story(project.id!, 'After stop')
    await tick(20)
    expect(await stores.cards.load(late.id!)).toBeNull()
    expect(suite.client.planning().commits.connected()).toBe(true)
  })
})
