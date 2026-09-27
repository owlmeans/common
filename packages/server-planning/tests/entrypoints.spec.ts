import { describe, expect, test } from 'bun:test'
import { protocols } from '@owlmeans/entrypoint'
import { CommitState, makePlanningProtocols, TransitionAction, WorkcardKind, WorkcardNotFound } from '@owlmeans/planning'
import { executePlanning, getCard, getCommit, listCards } from '../src/actions/index.js'
import { servePlanningEntrypoints } from '../src/helper.js'
import {
  createProject, createTask, invoke, makeTestPlanning, OTHER_ENTITY, PROFILE, PROJECT, session, TASK,
} from './context.js'

const tree = makePlanningProtocols({ base: { alias: 'test:planning' }, guards: 'test-guard' })

describe('@owlmeans/server-planning — entrypoints', () => {
  test('one binding per protocol of the tree', () => {
    const declared = protocols(tree as never)
    const bindings = servePlanningEntrypoints(tree)

    expect(bindings.length).toBe(declared.length)
    expect(new Set(bindings.map(binding => binding.alias))).toEqual(new Set(declared.map(protocol => protocol.alias)))
  })

  test('execute takes the actor and createdBy from the request, never from the body', async () => {
    const { context } = await makeTestPlanning()
    const execute = executePlanning(tree.execute, { scope: () => ({ channel: 'web' }) })

    const view = await invoke(execute, context, {
      ...session(),
      body: {
        card: { kind: WorkcardKind.Project, type: PROJECT, title: 'Wire', createdBy: 'intruder' },
        action: TransitionAction.Create,
        actor: { profileId: 'intruder', channel: 'forged', runId: 'forged' },
        wait: true,
      },
    })

    expect(view.transition.actor).toEqual({ profileId: PROFILE, userId: 'user-1', channel: 'web' })
    expect(view.card.createdBy).toBe(PROFILE)
  })

  test('another entity\'s card answers WorkcardNotFound — to a read and to a write', async () => {
    const { context, facade } = await makeTestPlanning()
    const project = await createProject(facade())
    const task = (await createTask(facade(), project.id!, 'Mine', { labels: ['urgent'] })).card!

    await expect(invoke(getCard(tree.card.get), context, { ...session(OTHER_ENTITY), params: { id: task.id } }))
      .rejects.toBeInstanceOf(WorkcardNotFound)
    await expect(invoke(executePlanning(tree.execute), context, {
      ...session(OTHER_ENTITY), body: { card: task.id, action: TransitionAction.Update, changes: { title: 'Theirs' } },
    })).rejects.toBeInstanceOf(WorkcardNotFound)

    const listed = await invoke(listCards(tree.card.list), context, { ...session(), query: { type: TASK, labels: 'urgent,later' } })
    expect(listed.items.map((card: { id: string }) => card.id)).toEqual([task.id])
    expect((await invoke(listCards(tree.card.list), context, { ...session(OTHER_ENTITY), query: { type: TASK } })).total).toBe(0)
  })

  test('commit.get holds until the commit lands, and never past maxPoll', async () => {
    const { context, facade, store } = await makeTestPlanning({}, { sync: false })
    const receipt = await facade().execute({ card: { kind: WorkcardKind.Project, type: PROJECT, title: 'Polled' }, action: TransitionAction.Create })
    const request = { ...session(), params: { transition: receipt.transition.id }, query: { wait: 3600 } }

    const clamped = Date.now()
    const pending = await invoke(getCommit(tree.commit.get, { maxPoll: 0.05 }), context, request)
    expect(pending.state).toBe(CommitState.Pending)
    expect(Date.now() - clamped).toBeLessThan(1000)

    const held = invoke(getCommit(tree.commit.get), context, request)
    await new Promise(resolve => setTimeout(resolve, 20))
    await store.flush()
    const landed = await held
    expect(landed.state).toBe(CommitState.Committed)
    expect(landed.card.title).toBe('Polled')
  })
})
