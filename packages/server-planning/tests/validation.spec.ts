import { describe, expect, test } from 'bun:test'
import {
  CardTypeNotAllowed, FieldsInvalid, IllegalTransition, LabelNotAllowed, PlanningError, TransitionAction, WorkcardKind,
} from '@owlmeans/planning'
import { createProject, createTask, makeTestPlanning, NOTE, TASK } from './context.js'

describe('@owlmeans/server-planning — validation', () => {
  test('a transition the flow does not offer from the current status is IllegalTransition', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning)
    const task = (await createTask(planning, project.id!)).card!

    await expect(planning.execute({ card: task.id!, action: TransitionAction.Transit, transition: 'finish' }))
      .rejects.toBeInstanceOf(IllegalTransition)
    await expect(planning.execute({ card: task.id!, action: TransitionAction.Transit, transition: 'approve' }))
      .rejects.toBeInstanceOf(IllegalTransition)
    expect((await planning.transitions.list({ card: task.id })).total).toBe(1)
  })

  test('fields outside the type schema are FieldsInvalid, labels outside the list LabelNotAllowed', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning)

    await expect(createTask(planning, project.id!, 'Bad', { fields: { area: 'moon' } })).rejects.toBeInstanceOf(FieldsInvalid)
    await expect(createTask(planning, project.id!, 'Bad', { labels: ['someday'] })).rejects.toBeInstanceOf(LabelNotAllowed)

    const task = (await createTask(planning, project.id!)).card!
    await expect(planning.execute({ card: task.id!, action: TransitionAction.Update, changes: { fields: { extra: 1 } } }))
      .rejects.toBeInstanceOf(FieldsInvalid)
    expect((await planning.cards.list({ parent: project.id })).total).toBe(1)
  })

  test('a card type the parent does not accept is CardTypeNotAllowed', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning)
    const task = (await createTask(planning, project.id!)).card!

    await expect(planning.execute({
      card: { kind: WorkcardKind.Card, type: NOTE, parent: project.id!, title: 'Note' }, action: TransitionAction.Create,
    })).rejects.toBeInstanceOf(CardTypeNotAllowed)
    await expect(planning.execute({
      card: { kind: WorkcardKind.Card, type: TASK, parent: task.id!, title: 'Sub' }, action: TransitionAction.Create,
    })).rejects.toBeInstanceOf(CardTypeNotAllowed)
  })

  test('a status written by an update is refused as immutable', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning)
    const task = (await createTask(planning, project.id!)).card!

    const refusal = await planning.execute({ card: task.id!, action: TransitionAction.Update, changes: { status: 'done' } })
      .catch(error => error)

    expect(refusal).toBeInstanceOf(PlanningError)
    expect(refusal.message).toContain('immutable:status')
    expect((await planning.cards.get(task.id!)).status).toBe('todo')
  })
})
