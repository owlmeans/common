import { describe, expect, test } from 'bun:test'
import { CommitState, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import type { CommitEvent, Transition, Workcard } from '@owlmeans/planning'
import { applyCards, applyCommitEvent, syncLinks } from '../src/index.js'
import { STORY, makeSuite } from './context.js'

/** The frame a bus publishes for a transition — ids only unless a record is given. */
const frameOf = (transition: Transition, record?: Workcard | null): CommitEvent => ({
  transition: transition.id!,
  card: transition.card,
  entityId: transition.entityId,
  project: transition.project,
  kind: transition.kind,
  type: transition.type,
  seq: transition.seq,
  action: transition.action,
  state: CommitState.Committed,
  at: transition.at,
  ...(record !== undefined ? { record } : {}),
})

describe('@owlmeans/client-planning — commit folds', () => {
  test('a committed frame without a record writes the card re-read through the facade', async () => {
    const suite = await makeSuite()
    const stores = suite.client.planningStores!()
    const project = await suite.project()
    const receipt = await suite.local.execute({
      card: { kind: WorkcardKind.Card, type: STORY, parent: project.id, title: 'Folded' },
      action: TransitionAction.Create,
    }, { wait: true })

    await applyCommitEvent(stores, frameOf(receipt.transition), suite.planning)

    expect(await stores.cards.get(receipt.transition.card)).toEqual(receipt.card!)
    expect((await stores.commits.get(receipt.transition.id!)).state).toBe(CommitState.Committed)
  })

  test('a committed delete removes the row and every link touching it', async () => {
    const suite = await makeSuite()
    const stores = suite.client.planningStores!()
    const project = await suite.project()
    const first = await suite.story(project.id!, 'First')
    const second = (await suite.local.execute({
      card: { kind: WorkcardKind.Card, type: STORY, parent: project.id, title: 'Second' },
      action: TransitionAction.Create,
      links: [{ type: 'follows', to: first.id! }],
    }, { wait: true })).card!
    await applyCards(stores, [first, second])
    const links = await suite.planning.relationships.list({ from: second.id })
    await syncLinks(stores.links, links.items)
    expect(await stores.links.count()).toBe(1)

    const removal = await suite.local.execute({ card: first.id!, action: TransitionAction.Delete }, { wait: true })
    await applyCommitEvent(stores, frameOf(removal.transition, null), suite.planning)

    expect(await stores.cards.load(first.id!)).toBeNull()
    expect(await stores.cards.load(second.id!)).not.toBeNull()
    expect(await stores.links.count()).toBe(0)
  })

  test('a frame for an id the store never saw still writes a row', async () => {
    const suite = await makeSuite()
    const stores = suite.client.planningStores!()
    const project = await suite.project()
    const receipt = await suite.local.execute({
      card: { kind: WorkcardKind.Card, type: STORY, parent: project.id, title: 'From another tab' },
      action: TransitionAction.Create,
    }, { wait: true })
    expect(await stores.cards.count()).toBe(0)

    await applyCommitEvent(stores, frameOf(receipt.transition, receipt.card))

    expect((await stores.cards.get(receipt.transition.card)).title).toBe('From another tab')
  })

  test('an older seq never overwrites a newer record', async () => {
    const suite = await makeSuite()
    const stores = suite.client.planningStores!()
    const project = await suite.project()
    const created = await suite.local.execute({
      card: { kind: WorkcardKind.Card, type: STORY, parent: project.id, title: 'Racing' },
      action: TransitionAction.Create,
    }, { wait: true })
    const started = await suite.local.execute({
      card: created.transition.card, action: TransitionAction.Transit, transition: 'start',
    }, { wait: true })
    await applyCards(stores, [started.card!])

    await applyCommitEvent(stores, frameOf(created.transition, created.card))

    const stored = await stores.cards.get(created.transition.card)
    expect(stored.seq).toBe(2)
    expect(stored.status).toBe('doing')
  })
})
