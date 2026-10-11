import { describe, expect, test } from 'bun:test'
import { AuthForbidden } from '@owlmeans/auth'
import {
  CommitState, makePlanningProtocols, ParentNotFound, PlanningForbidden, PlanningSchemaKind, SchemaOrigin,
  TransitionAction, WorkcardKind, WorkcardNotFound,
} from '@owlmeans/planning'
import type { CommitEvent, SchemaDefineReply, ScopedSchemaBundle } from '@owlmeans/planning'
import {
  defineSchemas, executePlanning, getCard, getCommit, listCards, listLinks, listSchemas, summarizeCards,
} from '../src/actions/index.js'
import type { PlanningAccess, PlanningHandlerOptions } from '../src/types.js'
import {
  createProject, createTask, ENTITY, invoke, makeTestPlanning, OTHER_ENTITY, PROJECT, session, TASK,
} from './context.js'

const tree = makePlanningProtocols({ base: { alias: 'test:planning' }, guards: 'test-guard', definitions: true })

const withAccess = (access: PlanningAccess | (() => PlanningAccess)): PlanningHandlerOptions => ({
  access: async () => typeof access === 'function' ? access() : access,
})

describe('@owlmeans/server-planning — access resolver', () => {
  test('the organization is the resolver\'s, never the token\'s, and a resolver throw is the answer', async () => {
    const { context, facade } = await makeTestPlanning()
    const theirs = await createProject(facade(OTHER_ENTITY), 'Theirs')
    await createProject(facade(), 'Mine')

    const listed = await invoke(listCards(tree.card.list, withAccess({ entityId: OTHER_ENTITY })), context, { ...session(ENTITY), query: {} })
    expect(listed.items.map((card: { id: string }) => card.id)).toEqual([theirs.id])

    const refusing: PlanningHandlerOptions = { access: async () => { throw new AuthForbidden('no-seat') } }
    await expect(invoke(listCards(tree.card.list, refusing), context, { ...session(), query: {} })).rejects.toBeInstanceOf(AuthForbidden)
  })

  test('projects narrow reads: an invisible project and its cards are absent, lists and summaries shrink', async () => {
    const { context, facade } = await makeTestPlanning()
    const visible = await createProject(facade(), 'Visible')
    const hidden = await createProject(facade(), 'Hidden')
    const seen = (await createTask(facade(), visible.id!, 'Seen')).card!
    const unseen = (await createTask(facade(), hidden.id!, 'Unseen')).card!
    await facade().execute({ card: unseen.id!, action: TransitionAction.Link, link: { type: 'blocks', to: seen.id! } }, { wait: true })
    const opts = withAccess({ entityId: ENTITY, projects: [visible.id!] })

    await expect(invoke(getCard(tree.card.get, opts), context, { ...session(), params: { id: unseen.id } })).rejects.toBeInstanceOf(WorkcardNotFound)
    await expect(invoke(getCard(tree.card.get, opts), context, { ...session(), params: { id: hidden.id } })).rejects.toBeInstanceOf(WorkcardNotFound)
    expect((await invoke(getCard(tree.card.get, opts), context, { ...session(), params: { id: seen.id } })).id).toBe(seen.id)

    const listed = await invoke(listCards(tree.card.list, opts), context, { ...session(), query: { type: TASK } })
    expect(listed.items.map((card: { id: string }) => card.id)).toEqual([seen.id])
    const summary = await invoke(summarizeCards(tree.card.summary, opts), context, { ...session(), query: { parents: `${visible.id},${hidden.id}` } })
    expect(Object.keys(summary)).toEqual([visible.id!])
    expect((await invoke(listLinks(tree.link.list, opts), context, { ...session(), query: { to: seen.id } })).total).toBe(0)
  })

  test('projects narrow writes: an invisible parent is ParentNotFound, an invisible card absent', async () => {
    const { context, facade } = await makeTestPlanning()
    const visible = await createProject(facade(), 'Visible')
    const hidden = await createProject(facade(), 'Hidden')
    const unseen = (await createTask(facade(), hidden.id!, 'Unseen')).card!
    const execute = executePlanning(tree.execute, withAccess({ entityId: ENTITY, projects: [visible.id!] }))

    await expect(invoke(execute, context, {
      ...session(), body: { card: { kind: WorkcardKind.Card, type: TASK, parent: hidden.id, title: 'Sneaky' }, action: TransitionAction.Create },
    })).rejects.toBeInstanceOf(ParentNotFound)
    await expect(invoke(execute, context, {
      ...session(), body: { card: unseen.id, action: TransitionAction.Update, changes: { title: 'Renamed' } },
    })).rejects.toBeInstanceOf(WorkcardNotFound)

    const made = await invoke(execute, context, {
      ...session(), body: { card: { kind: WorkcardKind.Card, type: TASK, parent: visible.id, title: 'Allowed' }, action: TransitionAction.Create, wait: true },
    })
    expect(made.card.title).toBe('Allowed')
    expect((await facade().cards.get(unseen.id!)).title).toBe('Unseen')
  })

  test('commit status and subscriptions stay inside the visible projects', async () => {
    const { context, facade, service } = await makeTestPlanning()
    const visible = await createProject(facade(), 'Visible')
    const hidden = await createProject(facade(), 'Hidden')
    const narrowed = service.for({ entityId: ENTITY, projects: [visible.id!] })
    const heard: CommitEvent[] = []
    const unsubscribe = await narrowed.commits.subscribe(event => { heard.push(event) })

    const seen = await createTask(facade(), visible.id!, 'Seen')
    const unseen = await createTask(facade(), hidden.id!, 'Unseen')
    unsubscribe()

    expect(heard.map(event => event.card)).toEqual([seen.card!.id!])
    await expect(invoke(getCommit(tree.commit.get, withAccess({ entityId: ENTITY, projects: [visible.id!] })), context, {
      ...session(), params: { transition: unseen.transition.id }, query: {},
    })).rejects.toBeInstanceOf(WorkcardNotFound)
    expect((await narrowed.commits.status(seen.transition.id!)).state).toBe(CommitState.Committed)
  })

  test('grants gate project creation, project deletion and schema definitions with a 403 refusal', async () => {
    const { context, facade } = await makeTestPlanning({}, { schemas: true })
    const parent = await createProject(facade(), 'Parent')
    const other = await createProject(facade(), 'Other')
    const nested = { kind: WorkcardKind.Project, type: PROJECT, parent: parent.id, title: 'Nested' }
    const scoped = (grants: PlanningAccess['grants']) => withAccess({ entityId: ENTITY, grants })

    await expect(invoke(executePlanning(tree.execute, scoped({})), context, {
      ...session(), body: { card: { kind: WorkcardKind.Project, type: PROJECT, title: 'Root' }, action: TransitionAction.Create },
    })).rejects.toBeInstanceOf(PlanningForbidden)
    expect(PlanningForbidden.httpStatus).toBe(403)
    await expect(invoke(executePlanning(tree.execute, scoped({ createProjects: [parent.id!] })), context, {
      ...session(), body: { card: { kind: WorkcardKind.Project, type: PROJECT, title: 'Root' }, action: TransitionAction.Create },
    })).rejects.toBeInstanceOf(PlanningForbidden)
    const made = await invoke(executePlanning(tree.execute, scoped({ createProjects: [parent.id!] })), context, {
      ...session(), body: { card: nested, action: TransitionAction.Create, wait: true },
    })
    expect(made.card.parent).toBe(parent.id)
    // A card is not a project: creating one needs no grant.
    await invoke(executePlanning(tree.execute, scoped({})), context, {
      ...session(), body: { card: { kind: WorkcardKind.Card, type: TASK, parent: parent.id, title: 'Task' }, action: TransitionAction.Create },
    })

    await expect(invoke(executePlanning(tree.execute, scoped({ deleteProjects: [other.id!] })), context, {
      ...session(), body: { card: parent.id, action: TransitionAction.Delete },
    })).rejects.toBeInstanceOf(PlanningForbidden)
    await invoke(executePlanning(tree.execute, scoped({ deleteProjects: [other.id!] })), context, {
      ...session(), body: { card: other.id, action: TransitionAction.Delete, wait: true },
    })
    expect(await facade().cards.load(other.id!)).toBeNull()

    const flow = { id: 'test:rota', version: 1, statuses: [{ key: 'due', intrinsic: 'planned' }], transitions: [] }
    await expect(invoke(defineSchemas(tree.schema.define!, scoped({ defineSchemas: [parent.id!] })), context, {
      ...session(), body: { flows: [flow] },
    })).rejects.toBeInstanceOf(PlanningForbidden)
    const layer: SchemaDefineReply = await invoke(defineSchemas(tree.schema.define!, scoped({ defineSchemas: [parent.id!] })), context, {
      ...session(), body: { project: parent.id, flows: [flow] },
    })
    expect([layer.bundle.origins?.flows['test:rota'], layer.records.map(record => record.key)]).toEqual([SchemaOrigin.Project, ['test:rota']])
  })
})

describe('@owlmeans/server-planning — schema handlers', () => {
  test('schema.list answers the code bundle without a schema port, and the scoped layer with one', async () => {
    const plain = await makeTestPlanning()
    const bundle = await invoke(listSchemas(tree.schema.list), plain.context, { ...session(), query: {} })
    expect(bundle).toEqual(plain.service.schemas.bundle())

    const scoped = await makeTestPlanning({}, { schemas: true })
    const project = await createProject(scoped.facade(), 'Layered')
    const note = { type: 'test:memo', kind: WorkcardKind.Card, version: 1, fields: { type: 'object' }, flows: ['test:task'], specifications: [] }
    await invoke(defineSchemas(tree.schema.define!), scoped.context, { ...session(), body: { project: project.id, types: [note] } })

    const entityLayer: ScopedSchemaBundle = await invoke(listSchemas(tree.schema.list), scoped.context, { ...session(), query: {} })
    const projectLayer: ScopedSchemaBundle = await invoke(listSchemas(tree.schema.list), scoped.context, { ...session(), query: { project: project.id } })
    expect(entityLayer.types.some(type => type.type === 'test:memo')).toBe(false)
    expect(projectLayer.origins?.types['test:memo']).toBe(SchemaOrigin.Project)
    await expect(invoke(listSchemas(tree.schema.list), scoped.context, { ...session(OTHER_ENTITY), query: { project: project.id } }))
      .rejects.toBeInstanceOf(WorkcardNotFound)

    const retired: SchemaDefineReply = await invoke(defineSchemas(tree.schema.define!), scoped.context, {
      ...session(), body: { project: project.id, retire: [{ kind: PlanningSchemaKind.Type, key: 'test:memo' }] },
    })
    expect([retired.bundle.retired?.types, retired.records[0]?.retired]).toEqual([['test:memo'], true])
  })
})
