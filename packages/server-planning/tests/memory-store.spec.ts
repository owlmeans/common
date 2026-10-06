import { describe, expect, test } from 'bun:test'
import { CommitState, IntrinsicStatus, SpecificationFormat, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import type { CommitEvent } from '@owlmeans/planning'
import { createProject, createTask, ENTITY, makeTestPlanning, OTHER_ENTITY, SPEC } from './context.js'

describe('@owlmeans/server-planning — the memory store', () => {
  test('folds in seq order and publishes one commit per transition', async () => {
    const { facade, store } = await makeTestPlanning()
    const planning = facade()
    const events: CommitEvent[] = []
    store.commits.subscribe(event => { events.push(event) })

    const project = await createProject(planning)
    const task = (await createTask(planning, project.id!)).card!
    await planning.execute({ card: task.id!, action: TransitionAction.Update, changes: { title: 'Renamed' } })
    await planning.execute({ card: task.id!, action: TransitionAction.Transit, transition: 'start' })

    const card = await planning.cards.get(task.id!)
    expect(card.seq).toBe(3)
    expect(card.head).toBe(3)
    expect(card.title).toBe('Renamed')
    expect(card.status).toBe('doing')
    expect(card.intrinsic).toBe(IntrinsicStatus.InProgress)
    expect(events.filter(event => event.card === task.id).map(event => [event.seq, event.state]))
      .toEqual([[1, CommitState.Committed], [2, CommitState.Committed], [3, CommitState.Committed]])
  })

  test('deleting a project purges its cards, specifications, links and log — a sibling survives', async () => {
    const { facade, store } = await makeTestPlanning()
    const planning = facade()
    const doomed = await createProject(planning, 'Doomed')
    const kept = await createProject(planning, 'Kept')
    const first = (await createTask(planning, doomed.id!, 'First')).card!
    const second = (await createTask(planning, doomed.id!, 'Second', {})).card!
    await planning.execute({ card: second.id!, action: TransitionAction.Link, link: { type: 'follows', to: first.id! } }, { wait: true })
    const spec = (await planning.execute({
      card: { kind: WorkcardKind.Specification, type: SPEC, parent: first.id!, title: 'design', category: 'design', format: SpecificationFormat.Json, body: '{}' },
      action: TransitionAction.Create,
    }, { wait: true })).card!
    const survivor = (await createTask(planning, kept.id!, 'Survivor')).card!

    const deleted = await planning.execute({ card: doomed.id!, action: TransitionAction.Delete }, { wait: true })

    for (const id of [doomed.id!, first.id!, second.id!, spec.id!]) {
      expect(await planning.cards.load(id)).toBeNull()
    }
    expect((await planning.relationships.list({ from: second.id })).total).toBe(0)
    expect((await planning.transitions.list({ project: doomed.id })).total).toBe(0)
    expect((await planning.commits.status(deleted.transition.id!)).state).toBe(CommitState.Committed)
    expect(await planning.cards.load(survivor.id!)).not.toBeNull()
    // The kept project, its task and their two create transitions.
    expect(await store.cards.purge(kept.id!, ENTITY)).toBe(4)
  })

  test('byKey answers the first transition under that key, within its entity only', async () => {
    const { facade, store } = await makeTestPlanning()
    const planning = facade()
    const receipt = await planning.execute({
      card: { kind: WorkcardKind.Project, type: 'test:project', title: 'Keyed' }, action: TransitionAction.Create, key: 'first',
    })

    expect((await store.transitions.byKey(ENTITY, 'first'))!.id).toBe(receipt.transition.id!)
    expect(await store.transitions.byKey(OTHER_ENTITY, 'first')).toBeNull()
  })

  test('a list honours parents, labels, a flow status and a field', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning, 'Main')
    const other = await createProject(planning, 'Other')
    const urgent = (await createTask(planning, project.id!, 'Urgent', { labels: ['urgent'], fields: { area: 'guest' } })).card!
    const shared = (await createTask(planning, project.id!, 'Shared', { labels: ['later'], parents: [other.id!], fields: { area: 'user' } })).card!
    await planning.execute({ card: shared.id!, action: TransitionAction.Transit, flow: 'test:review', transition: 'approve' })

    const ids = async (query: Parameters<typeof planning.cards.list>[0]) =>
      (await planning.cards.list(query)).items.map(card => card.id)

    expect(await ids({ labels: ['urgent'] })).toEqual([urgent.id])
    expect(await ids({ within: other.id })).toEqual([shared.id])
    expect(await ids({ flow: { id: 'test:review', status: 'approved' } })).toEqual([shared.id])
    expect(await ids({ fields: { area: 'guest' } })).toEqual([urgent.id])
    expect((await facade(OTHER_ENTITY).cards.list({ labels: ['urgent'] })).total).toBe(0)
  })
})
