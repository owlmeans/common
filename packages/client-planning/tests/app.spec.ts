import { describe, expect, test } from 'bun:test'
import { appSchemaHelper, FieldsInvalid, SchemaInvalid, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import type { PlanningAppDeclarations, PlanningService, WorkcardTypeSchema } from '@owlmeans/planning'
import { makePlanningFieldValidator } from '../src/index.js'
import { makeSuite, STORY, STORY_FLOW } from './context.js'
import type { Suite } from './context.js'

/** A choir: every type says what it is for, every card may carry a part. */
const APP: PlanningAppDeclarations = {
  type: { properties: { description: { type: 'string' } } },
  card: { properties: { part: { type: 'string', enum: ['soprano', 'alto', 'tenor', 'bass'] } } },
}
/** What a service serves: the declarations merged (normalized with `type: 'object'`). */
const SERVED = appSchemaHelper.merge([APP])

const SECTIONAL: WorkcardTypeSchema = {
  type: 'test:sectional', kind: WorkcardKind.Card, version: 1, flows: [STORY_FLOW], specifications: [],
  fields: { type: 'object', additionalProperties: false },
}

const declared = async (opts: Parameters<typeof makeSuite>[0] = {}): Promise<Suite> => {
  const suite = await makeSuite(opts)
  ;(suite.server as unknown as { planning: () => PlanningService }).planning().use({ name: 'choir', schemas: { app: APP } })

  return suite
}

describe('@owlmeans/client-planning — application declarations', () => {
  test('the served bundle carries them: the registry validates base fields, a form validator takes the same schema', async () => {
    const suite = await declared()
    const registry = await suite.client.planning().loadSchemas()

    expect(registry.app()).toEqual(SERVED!)
    expect(registry.validator(STORY)({ area: 'stage', part: 'alto' })).toBe(true)
    expect(registry.validator(STORY)({ area: 'stage', part: 'drums' })).toBe(false)
    const form = makePlanningFieldValidator(registry.fieldsSchema(STORY))
    expect(form.validateFields({ area: 'stage', part: 'alto' }).valid).toBe(true)
    expect(form.validateFields({ area: 'stage', part: 'drums' }).valid).toBe(false)
    expect(form.validateFields({ area: 'stage', colour: 'red' }).valid).toBe(false)

    const project = await suite.project('Spring concert')
    await expect(suite.planning.execute({
      card: { kind: WorkcardKind.Card, type: STORY, parent: project.id!, title: 'Warm-up', fields: { part: 'drums' } },
      action: TransitionAction.Create,
    }, { wait: true })).rejects.toBeInstanceOf(FieldsInvalid)
  })

  test('a schemas-only client plugin merges over the served declarations; a malformed one is refused', async () => {
    const suite = await declared()
    const service = suite.client.planning()
    await service.loadSchemas()

    service.use({ name: 'stage', schemas: { app: { card: { properties: { row: { type: 'number' } } } } } })
    expect(Object.keys(service.schemas.app()?.card?.properties ?? {})).toEqual(['part', 'row'])
    expect(() => service.use({ name: 'broken', schemas: { app: { card: { properties: { 'a.b': {} } } } } })).toThrow(SchemaInvalid)
    expect(service.plugins().map(plugin => plugin.name)).toEqual(['stage'])
    service.use({ name: 'stage' })
    expect(Object.keys(service.schemas.app()?.card?.properties ?? {})).toEqual(['part'])
  })

  test('definitions carry a type\'s app bag over the wire; a refused bag crosses as SchemaInvalid', async () => {
    const suite = await declared({ definitions: true })
    const definitions = suite.planning.definitions!

    await definitions.define({ types: [{ ...SECTIONAL, app: { description: 'Small groups' } }] })
    const layer = await definitions.registry()
    expect((layer.type(SECTIONAL.type) as WorkcardTypeSchema).app).toEqual({ description: 'Small groups' })
    expect(layer.app()).toEqual(SERVED!)
    expect(layer.validator(SECTIONAL.type)({ part: 'tenor' })).toBe(true)
    await expect(definitions.putType({ ...SECTIONAL, version: 2, app: { conductor: 'me' } })).rejects.toBeInstanceOf(SchemaInvalid)
  })
})
