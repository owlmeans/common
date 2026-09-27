import { describe, expect, test } from 'bun:test'
import { CommitState, PlanningRefused, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import { makeMemoryPlanningStore } from '../src/store/memory.js'
import { BUG, createProject, createTask, ENTITY, makeTestPlanning, PROJECT, TASK } from './context.js'

describe('@owlmeans/server-planning — plugins', () => {
  test('before middlewares run in order, and a throw refuses with nothing appended', async () => {
    const calls: string[] = []
    const { facade, service } = await makeTestPlanning({
      plugins: [
        { name: 'second', order: 20, before: async () => { calls.push('second') } },
        { name: 'first', order: 10, before: async exec => { calls.push('first'); return { ...exec, cause: 'first' } } },
      ],
    })
    const planning = facade()

    const project = await planning.execute({ card: { kind: WorkcardKind.Project, type: PROJECT, title: 'P' }, action: TransitionAction.Create }, { wait: true })
    expect(calls).toEqual(['first', 'second'])
    expect(project.transition.cause).toBe('first')

    service.use({ name: 'refuser', order: 30, before: async () => { throw new Error('not today') } })
    const refusal = await createTask(planning, project.card!.id!).catch(error => error)
    expect(refusal).toBeInstanceOf(PlanningRefused)
    expect(refusal.message).toContain('refuser:not today')
    expect((await planning.cards.list({ parent: project.card!.id, type: TASK })).total).toBe(0)
  })

  test('the first plugin that mints a code wins', async () => {
    const { facade } = await makeTestPlanning({
      plugins: [
        { name: 'late', order: 20, mintCode: async () => 'T-LATE' },
        { name: 'early', order: 10, mintCode: async () => 'T-EARLY' },
        { name: 'silent', order: 5, mintCode: async () => undefined },
      ],
    })
    const planning = facade()
    const project = await createProject(planning)

    expect((await createTask(planning, project.id!)).card!.code).toBe('T-EARLY')
  })

  test('a plugin that owns a type receives its writes and answers its reads', async () => {
    const bugs = makeMemoryPlanningStore()
    const { facade, store } = await makeTestPlanning({ plugins: [{ name: 'bugs', owns: type => type === BUG, store: bugs }] })
    const planning = facade()
    const project = await createProject(planning)

    const bug = (await planning.execute({
      card: { kind: WorkcardKind.Card, type: BUG, parent: project.id!, title: 'Crash' }, action: TransitionAction.Create,
    }, { wait: true })).card!

    expect(await bugs.cards.get(bug.id!, ENTITY)).not.toBeNull()
    expect(await store.cards.get(bug.id!, ENTITY)).toBeNull()
    expect((await planning.cards.list({ type: BUG })).total).toBe(1)
    expect((await planning.cards.load(bug.id!))!.title).toBe('Crash')
    // A query naming no type is the default store's alone.
    expect((await planning.cards.list({ parent: project.id })).total).toBe(0)
  })

  test('after hooks run once per committed transition, in the folding process, and never fail a write', async () => {
    const seen: string[] = []
    const { facade, store } = await makeTestPlanning({
      plugins: [
        { name: 'boom', order: 1, after: async () => { throw new Error('boom') } },
        { name: 'counter', after: async (event, ctx) => { seen.push(`${event.card}:${event.state}:${ctx.transition?.actor.channel}`) } },
      ],
    }, { sync: false })
    const planning = facade()
    const errors = console.error
    console.error = () => undefined
    try {
      const receipt = await planning.execute({ card: { kind: WorkcardKind.Project, type: PROJECT, title: 'Later' }, action: TransitionAction.Create })
      expect(receipt.transition.commit.state).toBe(CommitState.Pending)
      expect(seen).toEqual([])

      await store.flush()
      await store.flush()
      await store.flush(receipt.transition.card)

      expect(seen).toEqual([`${receipt.transition.card}:committed:test`])
      expect((await receipt.committed({ timeout: 100 }))!.title).toBe('Later')
    } finally {
      console.error = errors
    }
  })
})
