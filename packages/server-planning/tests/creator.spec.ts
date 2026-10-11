import { describe, expect, test } from 'bun:test'
import { CommitState, makePlanningProtocols, PlanningError, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import type { PlanningFacade, Transition, TransitionExecution, WorkcardChanges, WorkcardDraft } from '@owlmeans/planning'
import { executePlanning, executionHelper } from '../src/actions/index.js'
import { createProject, createTask, ENTITY, invoke, makeTestPlanning, PROFILE, PROJECT, session, TASK } from './context.js'
import { creatorHelper } from '../src/executor.js'

const tree = makePlanningProtocols({ base: { alias: 'test:planning' }, guards: 'test-guard' })

const draftOf = (exec: TransitionExecution): WorkcardDraft => exec.card as WorkcardDraft

describe('@owlmeans/server-planning — a create\'s createdBy', () => {
  test('an in-process create is stamped with the scope\'s profile, on the card and in the log', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning)
    const receipt = await createTask(planning, project.id!)

    expect(project.createdBy).toBe(PROFILE)
    expect(receipt.card!.createdBy).toBe(PROFILE)
    expect(receipt.transition.changes?.createdBy).toBe(PROFILE)
    expect((await planning.cards.get(receipt.card!.id!)).createdBy).toBe(PROFILE)
  })

  test('an explicit createdBy wins over the scope', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning, 'Delegated', { createdBy: 'owner-7' })

    expect(project.createdBy).toBe('owner-7')
    expect((await createTask(planning, project.id!, 'Theirs', { createdBy: 'owner-8' })).card!.createdBy).toBe('owner-8')
  })

  test('the subject falls back to the userId, then to the scope\'s actor', async () => {
    const { service } = await makeTestPlanning()

    const byUser = await createProject(service.for({ entityId: ENTITY, userId: 'user-9' }))
    const byActor = await createProject(service.for({ entityId: ENTITY, actor: { profileId: 'agent-profile' } }))

    expect(byUser.createdBy).toBe('user-9')
    expect(byActor.createdBy).toBe('agent-profile')
  })

  test('a scope that names nobody leaves createdBy unset', async () => {
    const { service } = await makeTestPlanning()

    const system = await createProject(service.for({ entityId: ENTITY, service: 'importer', channel: 'job' }))

    expect(system.createdBy).toBeUndefined()
    expect(Object.keys(system)).not.toContain('createdBy')
  })

  test('later writes by another profile never move it, and the caller\'s execution is not touched', async () => {
    const { service, facade } = await makeTestPlanning()
    const exec: TransitionExecution = {
      card: { kind: WorkcardKind.Project, type: PROJECT, title: 'Kept' }, action: TransitionAction.Create,
    }
    const project = (await facade().execute(exec, { wait: true })).card!
    const other = service.for({ entityId: ENTITY, profileId: 'profile-2' })

    await other.execute({ card: project.id!, action: TransitionAction.Update, changes: { title: 'Renamed' } }, { wait: true })
    await other.execute({ card: project.id!, action: TransitionAction.Transit, transition: 'activate' }, { wait: true })

    expect((await other.cards.get(project.id!)).createdBy).toBe(PROFILE)
    expect(draftOf(exec).createdBy).toBeUndefined()
  })

  test('a before plugin already sees the stamped createdBy', async () => {
    const seen: (string | undefined)[] = []
    const { facade } = await makeTestPlanning({
      plugins: [{
        name: 'owner-check', order: 10,
        before: async exec => { seen.push(typeof exec.card === 'object' ? exec.card.createdBy : 'update') },
      }],
    })

    await createProject(facade())

    expect(seen).toEqual([PROFILE])
  })

  test('the wire action is unchanged: the body\'s claim is replaced by the request\'s subject', async () => {
    const { context } = await makeTestPlanning()
    const execute = executePlanning(tree.execute)
    const body = { card: { kind: WorkcardKind.Project, type: PROJECT, title: 'Wire', createdBy: 'intruder' }, action: TransitionAction.Create, wait: true }

    const signed = await invoke(execute, context, { ...session(), body })
    expect(signed.card.createdBy).toBe(PROFILE)

    const byUser = await invoke(execute, context, {
      ...session(ENTITY, { auth: { type: 'test', userId: 'user-1', entitySlug: ENTITY, scopes: ['*'] } }), body,
    })
    expect(byUser.card.createdBy).toBe('user-1')

    const anonymous = await invoke(execute, context, {
      ...session(ENTITY, { auth: { type: 'test', entitySlug: ENTITY, scopes: ['*'] } }), body,
    })
    expect(anonymous.card.createdBy).toBeUndefined()
  })

  test('wireExecution still answers the execution the executor will run', () => {
    const body = { card: { kind: WorkcardKind.Project, type: PROJECT, title: 'W', createdBy: 'intruder' }, action: TransitionAction.Create }

    expect(draftOf(executionHelper.wireExecution(body, { entityId: ENTITY, profileId: PROFILE, userId: 'user-1' })).createdBy).toBe(PROFILE)
    expect(draftOf(executionHelper.wireExecution(body, { entityId: ENTITY, userId: 'user-1' })).createdBy).toBe('user-1')
    expect(draftOf(executionHelper.wireExecution(body, { entityId: ENTITY })).createdBy).toBeUndefined()
  })

  test('creatorOf and withCreator', () => {
    expect(creatorHelper.creatorOf({ entityId: ENTITY, profileId: 'p', userId: 'u', actor: { profileId: 'a' } })).toBe('p')
    expect(creatorHelper.creatorOf({ entityId: ENTITY, profileId: '', userId: 'u' })).toBe('u')
    expect(creatorHelper.creatorOf({ entityId: ENTITY, actor: { userId: 'au', service: 's' } })).toBe('au')
    expect(creatorHelper.creatorOf({ entityId: ENTITY, service: 's' })).toBeUndefined()

    const update: TransitionExecution = { card: 'card-1', action: TransitionAction.Update, changes: { title: 'T' } }
    expect(creatorHelper.withCreator(update, { entityId: ENTITY, profileId: 'p' })).toBe(update)
    const blank: TransitionExecution = { card: { kind: WorkcardKind.Project, type: PROJECT, title: 'T', createdBy: '' }, action: TransitionAction.Create }
    expect(draftOf(creatorHelper.withCreator(blank, { entityId: ENTITY, profileId: 'p' })).createdBy).toBe('p')
  })
})

/** The refusal of a write that names a provenance field, and the log it left untouched. */
const refusedOf = async (run: Promise<unknown>): Promise<string> => {
  const error = await run.then(() => null, (error: Error) => error)
  expect(error).toBeInstanceOf(PlanningError)
  return error!.message
}

const logOf = async (planning: PlanningFacade, card: string): Promise<number> =>
  (await planning.transitions.list({ card })).total

describe('@owlmeans/server-planning — createdBy never moves after the create', () => {
  test('an in-process update, transit, unset or create overlay naming it is refused, and nothing is appended', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning)
    const task = (await createTask(planning, project.id!)).card!
    const attempts: TransitionExecution[] = [
      { card: task.id!, action: TransitionAction.Update, changes: { createdBy: 'intruder' } },
      { card: task.id!, action: TransitionAction.Update, changes: { title: 'Mine now', createdBy: 'intruder' } },
      { card: task.id!, action: TransitionAction.Update, changes: { createdBy: null } as unknown as WorkcardChanges },
      { card: task.id!, action: TransitionAction.Update, unset: ['createdBy'] },
      { card: task.id!, action: TransitionAction.Transit, transition: 'start', changes: { createdBy: 'intruder' } },
      { card: { kind: WorkcardKind.Card, type: TASK, parent: project.id!, title: 'Overlay' }, action: TransitionAction.Create, changes: { createdBy: 'intruder' } },
    ]

    for (const exec of attempts) {
      expect(await refusedOf(planning.execute(exec, { wait: true }))).toBe('planning:immutable:createdBy')
    }
    expect(await refusedOf(planning.execute({ card: task.id!, action: TransitionAction.Update, changes: { createdAt: '2001-01-01T00:00:00.000Z' } as WorkcardChanges })))
      .toBe('planning:immutable:createdAt')
    expect(await refusedOf(planning.execute({ card: task.id!, action: TransitionAction.Update, unset: ['createdAt'] })))
      .toBe('planning:immutable:createdAt')

    const card = await planning.cards.get(task.id!)
    expect([card.createdBy, card.title, card.status, card.seq]).toEqual([PROFILE, 'A task', 'todo', 1])
    expect(await logOf(planning, task.id!)).toBe(1)
    expect((await planning.cards.list({ parent: project.id })).total).toBe(1)
  })

  test('a before plugin cannot move it either', async () => {
    const { facade } = await makeTestPlanning({
      plugins: [{
        name: 'reassign', order: 10,
        before: async exec => exec.action === TransitionAction.Update
          ? { ...exec, changes: { ...exec.changes, createdBy: 'plugin-owner' } }
          : undefined,
      }],
    })
    const planning = facade()
    const project = await createProject(planning)

    expect(await refusedOf(planning.execute({ card: project.id!, action: TransitionAction.Update, changes: { title: 'Renamed' } })))
      .toBe('planning:immutable:createdBy')
    expect((await planning.cards.get(project.id!)).createdBy).toBe(PROFILE)
  })

  test('a trusted in-process create names it; the owner then moves it no more than anyone else', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning, 'On behalf', { createdBy: 'owner-7' })
    await planning.execute({ card: project.id!, action: TransitionAction.Update, changes: { title: 'Still theirs' } }, { wait: true })

    expect(await refusedOf(planning.execute({ card: project.id!, action: TransitionAction.Update, changes: { createdBy: PROFILE } })))
      .toBe('planning:immutable:createdBy')
    expect((await planning.cards.get(project.id!))).toMatchObject({ title: 'Still theirs', createdBy: 'owner-7', seq: 2 })
  })

  test('the wire refuses it on an update, an unset and a create\'s changes; the draft claim is still dropped', async () => {
    const { context, facade } = await makeTestPlanning()
    const execute = executePlanning(tree.execute)
    const created = await invoke(execute, context, {
      ...session(), body: { card: { kind: WorkcardKind.Project, type: PROJECT, title: 'Wire', createdBy: 'intruder' }, action: TransitionAction.Create, wait: true },
    })
    const id = created.card.id as string
    const bodies = [
      { card: id, action: TransitionAction.Update, changes: { createdBy: 'intruder' }, wait: true },
      { card: id, action: TransitionAction.Update, changes: { title: 'Hijacked', createdBy: 'intruder' }, wait: true },
      { card: id, action: TransitionAction.Update, unset: ['createdBy'], wait: true },
      { card: id, action: TransitionAction.Transit, transition: 'activate', changes: { createdBy: 'intruder' }, wait: true },
      { card: { kind: WorkcardKind.Project, type: PROJECT, title: 'Overlay' }, action: TransitionAction.Create, changes: { createdBy: 'intruder' }, wait: true },
    ]

    for (const body of bodies) {
      expect(await refusedOf(invoke(execute, context, { ...session(), body }))).toBe('planning:immutable:createdBy')
    }
    expect(await refusedOf(invoke(execute, context, { ...session(), body: { card: id, action: TransitionAction.Update, unset: ['createdAt'] } })))
      .toBe('planning:immutable:createdAt')

    expect(created.card.createdBy).toBe(PROFILE)
    const card = await facade().cards.get(id)
    expect([card.createdBy, card.title, card.status, card.seq]).toEqual([PROFILE, 'Wire', 'open', 1])
    expect(await logOf(facade(), id)).toBe(1)
    expect((await facade().cards.list({ kind: WorkcardKind.Project })).total).toBe(1)
  })

  test('a legacy transition that named it still folds, and the card keeps committing past it', async () => {
    const { facade, store } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning)
    const task = (await createTask(planning, project.id!)).card!
    const legacy = async (patch: Partial<Transition>) => {
      const seq = await store.transitions!.nextSeq(task.id!, null)
      return await store.transitions!.append({
        entityId: task.entityId, card: task.id!, kind: task.kind, type: task.type, project: project.id!, seq,
        action: TransitionAction.Update, changes: {}, actor: { profileId: 'intruder' },
        at: '2001-01-01T00:00:00.000Z', commit: { state: CommitState.Pending }, ...patch,
      })
    }

    const renamed = await legacy({ changes: { title: 'Legacy', createdBy: 'intruder' } })
    const cleared = await legacy({ unset: ['createdBy'] })
    await store.cards.project(task.id!)

    expect((await planning.commits.status(renamed.id!)).state).toBe(CommitState.Committed)
    expect((await planning.commits.status(cleared.id!)).state).toBe(CommitState.Committed)
    const folded = await planning.cards.get(task.id!)
    expect([folded.title, folded.seq, folded.createdBy]).toEqual(['Legacy', 3, undefined])

    await planning.execute({ card: task.id!, action: TransitionAction.Update, changes: { title: 'After' } }, { wait: true })
    expect(await refusedOf(planning.execute({ card: task.id!, action: TransitionAction.Update, changes: { createdBy: PROFILE } })))
      .toBe('planning:immutable:createdBy')
    expect((await planning.cards.get(task.id!))).toMatchObject({ title: 'After', seq: 4 })
  })

  test('assertCreatorFixed', () => {
    const draft = { kind: WorkcardKind.Project, type: PROJECT, title: 'T', createdBy: 'owner' }

    expect(() => creatorHelper.assertCreatorFixed({ card: draft, action: TransitionAction.Create })).not.toThrow()
    expect(() => creatorHelper.assertCreatorFixed({ card: 'c', action: TransitionAction.Update, changes: { title: 'T', createdBy: undefined } })).not.toThrow()
    expect(() => creatorHelper.assertCreatorFixed({ card: 'c', action: TransitionAction.Update, unset: ['fields.createdBy'] })).not.toThrow()
    expect(() => creatorHelper.assertCreatorFixed({ card: 'c', action: TransitionAction.Update, changes: { fields: { createdBy: 'x' } } })).not.toThrow()
    expect(() => creatorHelper.assertCreatorFixed({ card: 'c', action: TransitionAction.Update, changes: { createdBy: 'x' } })).toThrow('planning:immutable:createdBy')
    expect(() => creatorHelper.assertCreatorFixed({ card: 'c', action: TransitionAction.Delete, unset: ['createdBy'] })).toThrow('planning:immutable:createdBy')
    expect(() => creatorHelper.assertCreatorFixed({ card: draft, action: TransitionAction.Create, changes: { createdBy: 'x' } })).toThrow('planning:immutable:createdBy')
  })
})
