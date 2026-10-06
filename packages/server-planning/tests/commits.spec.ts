import { describe, expect, test } from 'bun:test'
import { CommitFailed, CommitState, CommitTimeout, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import type { CommitEvent, Transition } from '@owlmeans/planning'
import { createProject, ENTITY, makeTestPlanning, PROJECT } from './context.js'

const createPending = (planning: ReturnType<Awaited<ReturnType<typeof makeTestPlanning>>['facade']>, title: string) =>
  planning.execute({ card: { kind: WorkcardKind.Project, type: PROJECT, title }, action: TransitionAction.Create })

describe('@owlmeans/server-planning — commits', () => {
  test('waiting on a commit that already landed resolves with the card', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const receipt = await createPending(planning, 'Landed')

    expect(receipt.card!.title).toBe('Landed')
    expect((await receipt.committed())!.id).toBe(receipt.transition.card)
    expect((await planning.commits.wait(receipt.transition.id!, { timeout: 50 }))!.title).toBe('Landed')
  })

  test('a wait that times out is CommitTimeout and leaves the transition pending', async () => {
    const { facade, store } = await makeTestPlanning({}, { sync: false })
    const planning = facade()
    const receipt = await createPending(planning, 'Queued')

    expect(receipt.transition.commit.state).toBe(CommitState.Pending)
    await expect(receipt.committed({ timeout: 30 })).rejects.toBeInstanceOf(CommitTimeout)
    expect((await planning.commits.status(receipt.transition.id!)).state).toBe(CommitState.Pending)
    expect(await planning.cards.load(receipt.transition.card)).toBeNull()

    const waiting = planning.commits.wait(receipt.transition.id!, { timeout: 1000 })
    await store.flush()
    expect((await waiting)!.title).toBe('Queued')
  })

  test('a fold that fails marks the transition failed, and a waiter gets CommitFailed with the reason', async () => {
    const { facade, store } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning, 'Stable')
    const rogue = await store.transitions.append({
      entityId: ENTITY, card: project.id!, kind: WorkcardKind.Project, type: PROJECT, seq: 3,
      action: TransitionAction.Update, changes: { title: 'Skipped a seq' }, actor: {},
      at: new Date().toISOString(), commit: { state: CommitState.Pending },
    })

    await store.cards.project(project.id!)

    const refusal = await planning.commits.wait(rogue.id!, { timeout: 100 }).catch(error => error)
    expect(refusal).toBeInstanceOf(CommitFailed)
    expect(refusal.message).toContain('out-of-order')
    expect((await planning.commits.status(rogue.id!)).state).toBe(CommitState.Failed)
    expect((await planning.cards.get(project.id!)).title).toBe('Stable')
  })

  test('a failing middle transition does not block the next one — the fold goes past it', async () => {
    const { facade, store } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning, 'Before')
    const events: CommitEvent[] = []
    store.commits.subscribe(event => { events.push(event) })
    const logRow = (seq: number, patch: Partial<Transition>): Transition => ({
      entityId: ENTITY, card: project.id!, kind: WorkcardKind.Project, type: PROJECT, seq,
      action: TransitionAction.Update, changes: {}, actor: {}, at: new Date().toISOString(),
      commit: { state: CommitState.Pending }, ...patch,
    })
    // A corrupted row: `unset` is not a list, so the fold of seq 2 throws.
    const broken = await store.transitions.append(logRow(2, { changes: { title: 'Broken' }, unset: 5 as never }))
    const next = await store.transitions.append(logRow(3, { changes: { title: 'After' } }))

    await store.cards.project(project.id!)

    expect(events.map(event => [event.seq, event.state])).toEqual([[2, CommitState.Failed], [3, CommitState.Committed]])
    expect((await planning.commits.status(broken.id!)).state).toBe(CommitState.Failed)
    expect((await planning.commits.wait(next.id!, { timeout: 100 }))!.title).toBe('After')
    const card = await planning.cards.get(project.id!)
    expect(card.seq).toBe(3)
    expect(card.title).toBe('After')
  })
})
