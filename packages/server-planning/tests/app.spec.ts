import { describe, expect, test } from 'bun:test'
import {
  FieldsInvalid, IntrinsicStatus, makePlanningProtocols, SchemaInvalid, TransitionAction, WorkcardKind,
} from '@owlmeans/planning'
import type { PlanningAppDeclarations, SchemaDefineReply, ScopedSchemaBundle, StatusFlowSchema, WorkcardTypeSchema } from '@owlmeans/planning'
import { defineSchemas, listSchemas } from '../src/actions/index.js'
import { createProject, createTask, ENTITY, invoke, makeTestPlanning, session, TASK } from './context.js'

const tree = makePlanningProtocols({ base: { alias: 'test:planning' }, guards: 'test-guard', definitions: true })

const DESCRIBED: PlanningAppDeclarations = {
  type: { properties: { description: { type: 'string' } } },
  flow: { properties: { description: { type: 'string' } } },
}

const ESTIMATED: PlanningAppDeclarations = { card: { properties: { estimate: { type: 'number', minimum: 0 } } } }

const ROTA: StatusFlowSchema = {
  id: 'test:rota', version: 1, statuses: [{ key: 'due', intrinsic: IntrinsicStatus.Planned, initial: true }], transitions: [],
}

const CHORE: WorkcardTypeSchema = {
  type: 'test:chore', kind: WorkcardKind.Card, version: 1, flows: [ROTA.id], specifications: [],
  fields: { type: 'object', additionalProperties: false },
}

describe('@owlmeans/server-planning — application declarations', () => {
  test('the service\'s own come first, then every plugin\'s in plugin order; a replaced plugin takes its own away', async () => {
    const { service } = await makeTestPlanning({
      schemas: { app: { card: { properties: { estimate: { type: 'string' } } } } },
      plugins: [
        { name: 'late', order: 90, schemas: { app: { card: { properties: { estimate: { type: 'number' } }, required: ['estimate'] } } } },
        { name: 'early', order: 10, schemas: { app: { card: { properties: { estimate: { type: 'integer' }, hours: { type: 'number' } } } } } },
      ],
    })

    expect(service.schemas.app()?.card).toEqual({
      type: 'object', properties: { estimate: { type: 'number' }, hours: { type: 'number' } }, required: ['estimate'],
    })
    service.use({ name: 'late' })
    expect(service.schemas.app()?.card).toEqual({ type: 'object', properties: { estimate: { type: 'integer' }, hours: { type: 'number' } } })
    expect(service.schemas.bundle().app?.card?.properties.estimate).toEqual({ type: 'integer' })
  })

  test('a malformed declaration refuses the plugin and leaves the registry as it was', async () => {
    const { service } = await makeTestPlanning({ plugins: [{ name: 'app', schemas: { app: DESCRIBED } }] })
    const before = service.plugins().map(plugin => plugin.name)

    expect(() => service.use({ name: 'bad', schemas: { app: { card: { properties: {}, additionalProperties: false } as never } } }))
      .toThrow(SchemaInvalid)
    expect(service.plugins().map(plugin => plugin.name)).toEqual(before)
    expect(service.schemas.app()).toEqual(service.schemas.bundle().app!)
  })

  test('nothing declared: no `app` in the bundle, and an app bag on a data-defined type is refused', async () => {
    const { service, facade } = await makeTestPlanning({}, { schemas: true })

    expect('app' in service.schemas.bundle()).toBe(false)
    expect('app' in await facade().definitions!.bundle()).toBe(false)
    await expect(facade().definitions!.define({ flows: [ROTA], types: [{ ...CHORE, app: { description: 'x' } }] }))
      .rejects.toThrow('type:test:chore:app:undeclared')
    expect(await facade().definitions!.records()).toEqual([])
  })

  test('base card fields reach a code type with closed fields, on create and on update', async () => {
    const { facade } = await makeTestPlanning({ plugins: [{ name: 'app', schemas: { app: ESTIMATED } }] })
    const planning = facade()
    const project = await createProject(planning)

    const task = (await createTask(planning, project.id!, 'Estimated', { fields: { area: 'user', estimate: 3 } })).card!
    expect(task.fields).toEqual({ area: 'user', estimate: 3 })
    await expect(createTask(planning, project.id!, 'Negative', { fields: { estimate: -1 } })).rejects.toBeInstanceOf(FieldsInvalid)
    await expect(createTask(planning, project.id!, 'Unknown', { fields: { colour: 'red' } })).rejects.toBeInstanceOf(FieldsInvalid)
    await expect(planning.execute({ card: task.id!, action: TransitionAction.Update, changes: { fields: { estimate: 'soon' } } }, { wait: true }))
      .rejects.toBeInstanceOf(FieldsInvalid)
    expect((await planning.execute({ card: task.id!, action: TransitionAction.Update, changes: { fields: { estimate: 5 } } }, { wait: true })).card!.fields.estimate)
      .toBe(5)
    // A project is not a card type: its fields are its own type's alone.
    expect(planning.schemas.fieldsSchema(project.type)).toBe(planning.schemas.type(project.type).fields)
  })

  test('define, put and seed check the bags; the wire carries them both ways', async () => {
    const { context, facade } = await makeTestPlanning({ plugins: [{ name: 'app', schemas: { app: { ...DESCRIBED, ...ESTIMATED } } }] }, { schemas: true })
    const definitions = facade().definitions!

    const reply: SchemaDefineReply = await invoke(defineSchemas(tree.schema.define!), context, {
      ...session(), body: { flows: [{ ...ROTA, app: { description: 'Weekly' } }], types: [{ ...CHORE, app: { description: 'Small jobs' } }] },
    })
    expect(reply.records.map(record => (record.definition as { app?: unknown }).app)).toEqual([{ description: 'Weekly' }, { description: 'Small jobs' }])
    expect(reply.bundle.app?.type?.properties).toEqual({ description: { type: 'string' } })
    const listed: ScopedSchemaBundle = await invoke(listSchemas(tree.schema.list), context, { ...session(), query: {} })
    expect(listed.types.find(type => type.type === CHORE.type)?.app).toEqual({ description: 'Small jobs' })

    await expect(invoke(defineSchemas(tree.schema.define!), context, {
      ...session(), body: { types: [{ ...CHORE, app: { description: 7 } }] },
    })).rejects.toBeInstanceOf(SchemaInvalid)
    await expect(definitions.putType({ ...CHORE, version: 2, app: { owner: 'me' } })).rejects.toThrow('type:test:chore:app:')
    await expect(definitions.putFlow({ ...ROTA, version: 2, app: { owner: 'me' } })).rejects.toThrow('flow:test:rota:app:')
    await expect(definitions.seed({ types: [{ ...CHORE, type: 'test:errand', app: { owner: 'me' } }] })).rejects.toBeInstanceOf(SchemaInvalid)
    expect((await definitions.putType({ ...CHORE, version: 2, app: { description: 'Chores' } })).definition).toMatchObject({ app: { description: 'Chores' } })
    expect((await definitions.registry()).validator(CHORE.type)({ estimate: 1 })).toBe(true)
    expect((await definitions.registry()).validator(CHORE.type)({ estimate: -1 })).toBe(false)
  })

  test('a code task type keeps answering for an organization with no records', async () => {
    const { facade } = await makeTestPlanning({ plugins: [{ name: 'app', schemas: { app: ESTIMATED } }] }, { schemas: true })
    const registry = await facade(ENTITY).definitions!.registry()

    expect(registry.validator(TASK)({ area: 'guest', estimate: 2 })).toBe(true)
    expect(registry.validator(TASK)({ area: 'guest', estimate: -2 })).toBe(false)
  })
})
