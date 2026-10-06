import { describe, expect, test } from 'bun:test'
import {
  IllegalTransition, TransitionAction, WorkcardKind, WorkcardNotFound,
} from '@owlmeans/planning'
import type { Specification, WorkcardQuery } from '@owlmeans/planning'
import { OTHER_ENTITY_ID, PROFILE_ID, PROJECT, STORY, makeSuite } from './context.js'

describe('@owlmeans/client-planning — remote facade', () => {
  test('a rich query means on the client exactly what it means on the server', async () => {
    const suite = await makeSuite()
    const project = await suite.project()
    await suite.story(project.id!, 'Alpha login', { area: 'auth' })
    await suite.story(project.id!, 'Beta login', { area: 'billing' })
    await suite.story(project.id!, 'Gamma search', { area: 'auth' })

    const query: WorkcardQuery = {
      kind: WorkcardKind.Card, type: [STORY], parent: project.id, status: ['todo', 'doing'],
      fields: { area: 'auth' }, q: 'login', sort: ['title'], size: 0,
    }
    const remote = await suite.planning.cards.list(query)

    expect(remote).toEqual(await suite.local.cards.list(query))
    expect(remote.items.map(card => card.title)).toEqual(['Alpha login'])
    expect(await suite.planning.cards.count({ parent: project.id })).toBe(3)
    expect(await suite.planning.cards.summary([project.id!])).toEqual(await suite.local.cards.summary([project.id!]))
  })

  test('a server refusal arrives as its own class', async () => {
    const suite = await makeSuite()
    const project = await suite.project()
    const story = await suite.story(project.id!)

    const illegal = suite.planning.execute({ card: story.id!, action: TransitionAction.Transit, transition: 'finish' })
    await expect(illegal).rejects.toBeInstanceOf(IllegalTransition)

    await expect(suite.planning.cards.get('missing')).rejects.toBeInstanceOf(WorkcardNotFound)
    expect(await suite.planning.cards.load('missing')).toBeNull()

    // Another entity's card is answered exactly like a missing one.
    const foreign = await (suite.server as any).planning().for({ entityId: OTHER_ENTITY_ID }).execute({
      card: { kind: WorkcardKind.Project, type: PROJECT, title: 'Theirs' }, action: TransitionAction.Create,
    }, { wait: true })
    await expect(suite.planning.cards.get(foreign.card.id)).rejects.toBeInstanceOf(WorkcardNotFound)
  })

  test('execute answers a receipt whose committed() resolves with the folded card', async () => {
    const suite = await makeSuite({ sync: false })
    const project = await suite.project()

    const receipt = await suite.planning.execute({
      card: { kind: WorkcardKind.Card, type: STORY, parent: project.id, title: 'Remote story' },
      action: TransitionAction.Create,
      // The server decides who wrote; whatever the wire says is ignored.
      actor: { profileId: 'forged' },
    })
    expect(receipt.transition.actor.profileId).toBe(PROFILE_ID)

    setTimeout(() => { void suite.store.flush() }, 50)
    const card = await receipt.committed({ timeout: 5_000 })
    expect(card?.title).toBe('Remote story')
    expect(card?.code).toMatch(/^ST-/)

    const model = await suite.planning.model(card!)
    expect(model.can('start')).toBe(true)
    setTimeout(() => { void suite.store.flush() }, 50)
    const started = await model.transit('start', undefined, { wait: true, timeout: 5_000 })
    expect(started.card?.status).toBe('doing')
  })

  test('a model writes a specification, then revises the same record', async () => {
    const suite = await makeSuite()
    const project = await suite.planning.model(await suite.project())

    await project.write('brief', '# First', { wait: true })
    await project.write('brief', '# Second', { wait: true })

    const current = await suite.planning.specifications.current(project.id, 'brief') as Specification
    expect(current.body).toBe('# Second')
    expect(current.revision).toBe(2)
    const history = await suite.planning.specifications.revisions(current.id!)
    expect(history.map(revision => revision.body)).toContain('# First')
  })
})
