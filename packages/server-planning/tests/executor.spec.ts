import { describe, expect, test } from 'bun:test'
import { CommitState, TransitionAction, WorkcardConflict, WorkcardKind } from '@owlmeans/planning'
import { createProject, createTask, ENTITY, makeTestPlanning, PROFILE, TASK } from './context.js'

describe('@owlmeans/server-planning — the executor', () => {
  test('a create mints the id, the code and seq 1, and answers a committed receipt', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning)

    const receipt = await createTask(planning, project.id!)

    expect(project.code).toBe('test-project')
    expect(receipt.transition.seq).toBe(1)
    expect(receipt.transition.commit.state).toBe(CommitState.Committed)
    expect(receipt.transition.project).toBe(project.id)
    expect(receipt.transition.actor).toEqual({ profileId: PROFILE, channel: 'test' })
    expect(receipt.card!.id).toBe(receipt.transition.card)
    expect(receipt.card!.code).toMatch(/^T-[0-9A-Z]{5}$/)
    expect(receipt.card!.flows).toEqual({ 'test:task': 'todo', 'test:review': 'waiting' })
    expect(receipt.card!.entityId).toBe(ENTITY)
  })

  test('the same idempotency key appends once and answers the first receipt', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning)
    const exec = {
      card: { kind: WorkcardKind.Card, type: TASK, parent: project.id!, title: 'Once' },
      action: TransitionAction.Create,
      key: 'import:1',
    }

    const first = await planning.execute(exec, { wait: true })
    const second = await planning.execute(exec, { wait: true })

    expect(second.transition.id).toBe(first.transition.id!)
    expect((await planning.cards.list({ parent: project.id, type: TASK })).total).toBe(1)
  })

  test('a stale expectSeq is a WorkcardConflict and appends nothing', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning)
    const task = (await createTask(planning, project.id!)).card!

    await planning.execute({ card: task.id!, action: TransitionAction.Update, changes: { title: 'Renamed' }, expectSeq: 1 }, { wait: true })

    await expect(planning.execute({
      card: task.id!, action: TransitionAction.Update, changes: { title: 'Again' }, expectSeq: 1,
    })).rejects.toBeInstanceOf(WorkcardConflict)
    expect((await planning.transitions.list({ card: task.id })).total).toBe(2)
    expect((await planning.cards.get(task.id!)).title).toBe('Renamed')
  })

  test('an update with the values the card already holds appends nothing', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning)
    const task = (await createTask(planning, project.id!, 'Same', { fields: { area: 'user' } })).card!

    const receipt = await planning.execute({
      card: task.id!, action: TransitionAction.Update, changes: { title: 'Same', fields: { area: 'user' } },
    }, { wait: true })

    expect(receipt.transition.seq).toBe(1)
    expect((await planning.transitions.list({ card: task.id })).total).toBe(1)
  })
})
