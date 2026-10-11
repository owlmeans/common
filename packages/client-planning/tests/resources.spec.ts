import { describe, expect, test } from 'bun:test'
import { AssigneeKind, mentionHelper, WorkcardConflict } from '@owlmeans/planning'
import { makePlanningResourceFeed } from '../src/index.js'
import { ENTITY_ID, makeSuite } from './context.js'

describe('@owlmeans/client-planning — separate resources over real protocol handlers', () => {
  test('active assignee feeds include unset flags and reconcile removal without dropping retired history', async () => {
    const suite = await makeSuite({ resources: true })
    const draft = (nickname: string) => ({ nickname, kind: AssigneeKind.Human, type: 'test:participant', authentication: { provider: 'external', externalId: nickname } })
    const active = await suite.local.assignees.create(draft('active'))
    const removed = await suite.local.assignees.create(draft('removed'))
    const retired = await suite.local.assignees.create(draft('retired'))
    await suite.local.assignees.retire(retired.id!, { version: 1 })
    await suite.planning.assignees.get(retired.id!)
    const stores = suite.client.planningStores!()
    const ids = [active.id!, removed.id!, retired.id!]
    const feed = makePlanningResourceFeed(suite.client, { assignees: { ids, retired: false, size: 0 }, refresh: 0 })
    await feed.ready
    expect(feed.error).toBeNull()
    expect((await suite.planning.assignees.list({ ids, retired: false })).items.map(row => row.id).sort()).toEqual([active.id!, removed.id!].sort())
    expect(await stores.assignees.load(active.id!)).not.toBeNull()
    expect(await stores.assignees.load(removed.id!)).not.toBeNull()
    // A remote retirement removes the formerly-active snapshot, but unrelated historical
    // identities already in the shared mirror remain available for existing references.
    await suite.local.assignees.retire(removed.id!, { version: 1 })
    await feed.refresh()
    expect(await stores.assignees.load(removed.id!)).toBeNull()
    expect((await stores.assignees.get(retired.id!)).retired).toBe(true)
    expect(await stores.assignees.load(active.id!)).not.toBeNull()
    await feed.stop(); await suite.client.planning().close()
  })

  test('assignees, teams, comments and mentions roundtrip and mirror versioned writes', async () => {
    const suite = await makeSuite({ resources: true })
    const p = suite.planning, project = await suite.project(), card = await suite.story(project.id!)
    const actor = await p.assignees.create({ nickname: 'reader', kind: AssigneeKind.Human, type: 'test:participant', authentication: { provider: 'external', externalId: 'reader-id' } })
    const renamed = await p.assignees.update(actor.id!, { nickname: 'renamed' }, { version: 1 })
    expect(renamed.id).toBe(actor.id)
    await expect(p.assignees.update(actor.id!, { nickname: 'stale' }, { version: 1 })).rejects.toBeInstanceOf(WorkcardConflict)
    const team = await p.teams.create({ name: 'Editors', externalId: 'external:group' })
    await p.teams.addMember(team.id!, actor.id!); await p.teams.attach(team.id!, project.id!)
    expect((await p.teams.assignees(project.id!)).map(row => row.id)).toEqual([actor.id])
    const comment = await p.comments.create({ card: card.id!, body: mentionHelper.encode(actor.id!, actor.nickname) })
    expect(comment.author).toBe(suite.local.scope.assigneeId!)
    const mentions = await p.mentions.list({ comment: comment.id })
    expect(mentions.items.map(row => row.assignee)).toEqual([actor.id!])
    expect((await p.mentions.get(mentions.items[0].id!)).revision).toBe(1)
    await p.comments.update(comment.id!, { body: 'no mentions' }, { version: 1 })
    expect(await p.mentions.load(mentions.items[0].id!)).toBeNull()
    const stores = suite.client.planningStores!()
    expect((await stores.assignees.get(actor.id!)).version).toBe(2)
    expect((await stores.comments.get(comment.id!)).version).toBe(2)
    await p.comments.remove(comment.id!, { version: 2 })
    expect(await stores.comments.load(comment.id!)).toBeNull()
    const query = suite.calls.find(call => call.alias.endsWith(':mentions:list'))?.query
    expect(typeof query?.query).toBe('string')
    await suite.client.planning().close()
  })

  test('a delayed seed retains a local version written after the snapshot began', async () => {
    let release: (() => void) | undefined, entered: (() => void) | undefined
    const arrived = new Promise<void>(resolve => { entered = resolve })
    const held = new Promise<void>(resolve => { release = resolve })
    let delay = false
    const suite = await makeSuite({ resources: true, after: async call => {
      if (delay && call.alias.endsWith(':teams:list')) { delay = false; entered!(); await held }
    } })
    const p = suite.planning, stores = suite.client.planningStores!()
    const team = await p.teams.create({ name: 'Before' })
    delay = true
    const feed = makePlanningResourceFeed(suite.client, { scope: { entityId: ENTITY_ID }, teams: { size: 0 }, refresh: 0 })
    await arrived
    await p.teams.update(team.id!, { name: 'After' }, { version: 1 })
    const added = await p.teams.create({ name: 'New during seed' })
    release!(); await feed.ready
    expect((await stores.teams.get(team.id!)).name).toBe('After')
    expect((await stores.teams.get(added.id!)).name).toBe('New during seed')
    await feed.stop(); await suite.client.planning().close()
  })

  test('scope changes reject stale reads and close clears registered feeds and mirrors', async () => {
    let identity = 'old-session', release: (() => void) | undefined, entered: (() => void) | undefined
    const held = new Promise<void>(resolve => { release = resolve }), arrived = new Promise<void>(resolve => { entered = resolve })
    let delay = false
    const suite = await makeSuite({ resources: true, scopeKey: () => identity, after: async call => {
      if (delay && call.alias.endsWith(':teams:get')) { delay = false; entered!(); await held }
    } })
    const team = await suite.local.teams.create({ name: 'Old identity' })
    delay = true
    const reading = suite.planning.teams.get(team.id!)
    await arrived; identity = 'new-session'; release!()
    await expect(reading).rejects.toThrow('scope-changed')
    expect(await suite.client.planningStores!().teams.load(team.id!)).toBeNull()
    const feed = makePlanningResourceFeed(suite.client, { teams: { size: 0 }, refresh: 0 })
    await feed.ready
    expect(await suite.client.planningStores!().teams.load(team.id!)).not.toBeNull()
    await suite.client.planning().close()
    expect(await suite.client.planningStores!().teams.load(team.id!)).toBeNull()
    await feed.refresh()
    expect(await suite.client.planningStores!().teams.load(team.id!)).toBeNull()
  })

  test('stopping an in-flight resource feed prevents old tenant results from publishing', async () => {
    let release: (() => void) | undefined, entered: (() => void) | undefined
    const held = new Promise<void>(resolve => { release = resolve }), arrived = new Promise<void>(resolve => { entered = resolve })
    const suite = await makeSuite({ resources: true, after: async call => {
      if (call.alias.endsWith(':teams:list')) { entered!(); await held }
    } })
    const team = await suite.local.teams.create({ name: 'Old organization' })
    const feed = makePlanningResourceFeed(suite.client, { teams: { size: 0 }, refresh: 0 })
    await arrived
    const stopping = feed.stop(); release!(); await stopping
    expect(await suite.client.planningStores!().teams.load(team.id!)).toBeNull()
    await suite.client.planning().close()
  })
})
