import { describe, expect, test } from 'bun:test'
import {
  makePlanningProtocols, PlanningForbidden, SchemaOrigin, SpecificationFormat, TransitionAction, WorkcardKind,
} from '@owlmeans/planning'
import type { SchemaDefineReply, ScopedSchemaBundle, Specification } from '@owlmeans/planning'
import { defineSchemas, executePlanning, getCard, listCards, listSchemas } from '../src/actions/index.js'
import type { PlanningAccess, PlanningHandlerOptions } from '../src/types.js'
import { createProject, createTask, ENTITY, invoke, makeTestPlanning, PROJECT, session, TASK } from './context.js'

const tree = makePlanningProtocols({ base: { alias: 'test:planning' }, guards: 'test-guard', definitions: true })

const withAccess = (access: PlanningAccess): PlanningHandlerOptions => ({ access: async () => access })

const flow = { id: 'test:rota', version: 1, statuses: [{ key: 'due', intrinsic: 'planned' }], transitions: [] }

/** Two projects: the caller views both and writes only in `written`. */
const setup = async () => {
  const planning = await makeTestPlanning({}, { schemas: true })
  const { facade } = planning
  const viewed = await createProject(facade(), 'Viewed')
  const written = await createProject(facade(), 'Written')
  const viewedTask = (await createTask(facade(), viewed.id!, 'Viewed task')).card!
  const writtenTask = (await createTask(facade(), written.id!, 'Written task')).card!
  const access: PlanningAccess = { entityId: ENTITY, projects: [viewed.id!, written.id!], writes: [written.id!] }

  return { ...planning, viewed, written, viewedTask, writtenTask, access, opts: withAccess(access) }
}

describe('@owlmeans/server-planning — per-project writes', () => {
  test('a viewer reads a project it may not write in', async () => {
    const { context, viewed, viewedTask, opts } = await setup()

    expect((await invoke(getCard(tree.card.get, opts), context, { ...session(), params: { id: viewedTask.id } })).id).toBe(viewedTask.id)
    const listed = await invoke(listCards(tree.card.list, opts), context, { ...session(), query: { parent: viewed.id } })
    expect(listed.items.map((card: { id: string }) => card.id)).toEqual([viewedTask.id])
    const bundle: ScopedSchemaBundle = await invoke(listSchemas(tree.schema.list), context, { ...session(), query: { project: viewed.id } })
    expect(bundle.types.some(type => type.type === TASK)).toBe(true)
  })

  test('a viewer\'s execute answers 403 on a card, a project, a create and a link; nothing is appended', async () => {
    const { context, facade, viewed, viewedTask, writtenTask, opts } = await setup()
    const execute = executePlanning(tree.execute, opts)
    const refused = async (body: Record<string, unknown>) =>
      await expect(invoke(execute, context, { ...session(), body })).rejects.toBeInstanceOf(PlanningForbidden)

    expect(PlanningForbidden.httpStatus).toBe(403)
    await refused({ card: viewedTask.id, action: TransitionAction.Update, changes: { title: 'Renamed' } })
    await refused({ card: viewedTask.id, action: TransitionAction.Transit, transition: 'start' })
    await refused({ card: viewed.id, action: TransitionAction.Update, changes: { title: 'Renamed' } })
    await refused({ card: viewed.id, action: TransitionAction.Delete })
    await refused({ card: { kind: WorkcardKind.Card, type: TASK, parent: viewed.id, title: 'Sneaky' }, action: TransitionAction.Create })
    await refused({ card: { kind: WorkcardKind.Card, type: TASK, parent: writtenTask.id, parents: [viewed.id], title: 'Sneaky' }, action: TransitionAction.Create })
    await refused({ card: viewedTask.id, action: TransitionAction.Link, link: { type: 'blocks', to: writtenTask.id } })

    expect((await facade().cards.get(viewedTask.id!)).title).toBe('Viewed task')
    expect((await facade().cards.get(viewed.id!)).title).toBe('Viewed')
    expect((await facade().cards.list({ parent: viewed.id })).items.map(card => card.id)).toEqual([viewedTask.id])
  })

  test('a specification is written through its parent card', async () => {
    const { context, facade, viewedTask, writtenTask, opts } = await setup()
    const execute = executePlanning(tree.execute, opts)
    const design = async (task: string) => ((await (await facade().model(await facade().cards.get(task)))
      .write('design', '{"v":1}', { wait: true })).card as Specification)
    const viewedDesign = await design(viewedTask.id!)
    const writtenDesign = await design(writtenTask.id!)

    await expect(invoke(execute, context, {
      ...session(), body: { card: viewedDesign.id, action: TransitionAction.Update, changes: { body: '{"v":2}' } },
    })).rejects.toBeInstanceOf(PlanningForbidden)
    await expect(invoke(execute, context, {
      ...session(), body: {
        card: { kind: WorkcardKind.Specification, type: viewedDesign.type, parent: viewedTask.id, category: 'design', format: SpecificationFormat.Json, title: 'd', body: '{}' },
        action: TransitionAction.Create,
      },
    })).rejects.toBeInstanceOf(PlanningForbidden)
    const updated = await invoke(execute, context, {
      ...session(), body: { card: writtenDesign.id, action: TransitionAction.Update, changes: { body: '{"v":2}' }, wait: true },
    })
    expect(updated.card.body).toBe('{"v":2}')
  })

  test('a writer writes in its project: create, transit, link, and its project layer', async () => {
    const { context, facade, written, writtenTask, viewedTask, opts } = await setup()
    const execute = executePlanning(tree.execute, opts)

    const made = await invoke(execute, context, {
      ...session(), body: { card: { kind: WorkcardKind.Card, type: TASK, parent: written.id, title: 'Allowed' }, action: TransitionAction.Create, wait: true },
    })
    expect(made.card.parent).toBe(written.id)
    await invoke(execute, context, { ...session(), body: { card: writtenTask.id, action: TransitionAction.Transit, transition: 'start', wait: true } })
    expect((await facade().cards.get(writtenTask.id!)).status).toBe('doing')
    // A link FROM a writable card may point at a card the caller only views.
    await invoke(execute, context, {
      ...session(), body: { card: writtenTask.id, action: TransitionAction.Link, link: { type: 'blocks', to: viewedTask.id }, wait: true },
    })
    await invoke(execute, context, { ...session(), body: { card: written.id, action: TransitionAction.Update, changes: { title: 'Renamed' }, wait: true } })
    expect((await facade().cards.get(written.id!)).title).toBe('Renamed')

    const layer: SchemaDefineReply = await invoke(defineSchemas(tree.schema.define!, opts), context, {
      ...session(), body: { project: written.id, flows: [flow] },
    })
    expect(layer.bundle.origins?.flows['test:rota']).toBe(SchemaOrigin.Project)
  })

  test('a viewer\'s project-layer schema define answers 403; writes never reach the root', async () => {
    const { context, viewed, access, opts } = await setup()

    await expect(invoke(defineSchemas(tree.schema.define!, opts), context, {
      ...session(), body: { project: viewed.id, flows: [flow] },
    })).rejects.toBeInstanceOf(PlanningForbidden)
    // `writes` does not gate the organization layer (that is `grants.defineSchemas`), nor a project create.
    const project = await invoke(executePlanning(tree.execute, opts), context, {
      ...session(), body: { card: { kind: WorkcardKind.Project, type: PROJECT, title: 'New' }, action: TransitionAction.Create, wait: true },
    })
    expect(project.card.kind).toBe(WorkcardKind.Project)
    await expect(invoke(defineSchemas(tree.schema.define!, withAccess({ ...access, grants: { defineSchemas: [viewed.id!] } })), context, {
      ...session(), body: { project: viewed.id, flows: [flow] },
    })).rejects.toBeInstanceOf(PlanningForbidden)
    // A project create stays `createProjects`' decision when grants are present.
    await expect(invoke(executePlanning(tree.execute, withAccess({ ...access, grants: {} })), context, {
      ...session(), body: { card: { kind: WorkcardKind.Project, type: PROJECT, title: 'Refused' }, action: TransitionAction.Create },
    })).rejects.toBeInstanceOf(PlanningForbidden)
  })

  test('absent writes keep the old behaviour: every visible project is writable', async () => {
    const { context, facade, viewed, viewedTask, access } = await setup()
    const { writes: _writes, ...open } = access
    const opts = withAccess(open)

    await invoke(executePlanning(tree.execute, opts), context, {
      ...session(), body: { card: viewedTask.id, action: TransitionAction.Update, changes: { title: 'Renamed' }, wait: true },
    })
    expect((await facade().cards.get(viewedTask.id!)).title).toBe('Renamed')
    const layer: SchemaDefineReply = await invoke(defineSchemas(tree.schema.define!, opts), context, {
      ...session(), body: { project: viewed.id, flows: [flow] },
    })
    expect(layer.records.map(record => record.key)).toEqual(['test:rota'])
  })
})
