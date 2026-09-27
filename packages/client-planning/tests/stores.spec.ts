import { describe, expect, test } from 'bun:test'
import { isPending, modelOf, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import { applyCards, syncCards } from '../src/index.js'
import { makeSuite } from './context.js'

describe('@owlmeans/client-planning — the state mirror', () => {
  test('syncCards drops only what matches `where` and the list does not name', async () => {
    const suite = await makeSuite()
    const stores = suite.client.planningStores!()
    const one = await suite.project('One')
    const two = await suite.project('Two')
    const kept = await suite.story(one.id!, 'Kept')
    const deleted = await suite.story(one.id!, 'Deleted elsewhere')
    const elsewhere = await suite.story(two.id!, 'Another project')
    await applyCards(stores, [one, two, kept, deleted, elsewhere])

    await syncCards(stores.cards, [kept], { parent: one.id })

    const ids = (await stores.cards.list()).items.map(card => card.id).sort()
    expect(ids).toEqual([one.id, two.id, kept.id, elsewhere.id].sort())
  })

  test('projects, cards and specifications share one store and one id space', async () => {
    const suite = await makeSuite()
    const stores = suite.client.planningStores!()
    const project = await suite.project()
    await (await suite.planning.model(project)).write('brief', '# Brief', { wait: true })
    await suite.story(project.id!)

    const [projects, specs, cards] = await Promise.all([
      suite.planning.cards.list({ kind: WorkcardKind.Project }),
      suite.planning.specifications.list(project.id!),
      suite.planning.cards.list({ kind: WorkcardKind.Card, parent: project.id }),
    ])
    await syncCards(stores.cards, projects.items, { kind: WorkcardKind.Project })
    await syncCards(stores.cards, specs.items, { kind: WorkcardKind.Specification, parent: project.id })
    // A card list reloading with nothing in it must not take the project or its brief with it.
    await syncCards(stores.cards, [], { kind: WorkcardKind.Card, parent: project.id })
    await syncCards(stores.cards, cards.items, { kind: WorkcardKind.Card, parent: project.id })

    const kinds = (await stores.cards.list()).items.map(card => card.kind).sort()
    expect(kinds).toEqual([WorkcardKind.Card, WorkcardKind.Project, WorkcardKind.Specification])
  })

  test('a receipt marks the card pending (head > seq) and its commit clears the mark', async () => {
    const suite = await makeSuite({ sync: false })
    const stores = suite.client.planningStores!()
    const project = await suite.project()
    const story = await suite.story(project.id!)
    await applyCards(stores, [story])

    const receipt = await suite.planning.execute({
      card: story.id!, action: TransitionAction.Transit, transition: 'start', expectSeq: story.seq,
    })

    const marked = await stores.cards.get(story.id!)
    expect(isPending(marked)).toBe(true)
    expect(modelOf(marked, suite.planning).pending()).toBe(true)

    await suite.store.flush()
    await receipt.committed({ timeout: 5_000 })

    const folded = await stores.cards.get(story.id!)
    expect(isPending(folded)).toBe(false)
    expect(folded.status).toBe('doing')
  })
})
