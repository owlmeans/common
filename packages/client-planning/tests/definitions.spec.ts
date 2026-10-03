import { describe, expect, test } from 'bun:test'
import {
  PlanningSchemaKind, PlanningUnsupported, SchemaOrigin, TransitionAction, WorkcardKind,
} from '@owlmeans/planning'
import type { WorkcardTypeSchema } from '@owlmeans/planning'
import { definitionProtocols, makeSuite, STORY_FLOW } from './context.js'

/** A choir's rehearsal card, defined as data for one project. */
const REHEARSAL: WorkcardTypeSchema = {
  type: 'test:rehearsal', kind: WorkcardKind.Card, version: 1, fields: { type: 'object' }, flows: [STORY_FLOW], specifications: [],
}

describe('@owlmeans/client-planning — data-defined schemas', () => {
  test('a layer is read once per project and read again after any write', async () => {
    const suite = await makeSuite({ definitions: true })
    const project = await suite.project('Spring concert')
    const definitions = suite.planning.definitions!
    const reads = () => suite.calls.filter(call => call.alias === definitionProtocols.schema.list.alias).length

    const written = await definitions.define({ types: [REHEARSAL] }, { project: project.id })
    expect(written.map(record => [record.kind, record.key, record.version, record.project]))
      .toEqual([[PlanningSchemaKind.Type, REHEARSAL.type, 1, project.id]])

    const before = reads()
    const layer = await definitions.registry(project.id)
    await definitions.registry(project.id)
    expect(reads()).toBe(before + 1)
    expect(layer.originOf(PlanningSchemaKind.Type, REHEARSAL.type)).toBe(SchemaOrigin.Project)
    expect((await definitions.bundle()).types.some(type => type.type === REHEARSAL.type)).toBe(false)

    await definitions.putType({ ...REHEARSAL, version: 2, label: 'Rehearsal' }, { project: project.id })
    expect((await definitions.registry(project.id)).type(REHEARSAL.type).label).toBe('Rehearsal')
    expect(reads()).toBe(before + 3)
    await expect(definitions.records()).rejects.toBeInstanceOf(PlanningUnsupported)
  })

  test('a model of a card resolves its type in its own project\'s layer', async () => {
    const suite = await makeSuite({ definitions: true })
    const project = await suite.project('Autumn concert')
    await suite.planning.definitions!.define({ types: [REHEARSAL] }, { project: project.id })
    const card = (await suite.local.execute({
      card: { kind: WorkcardKind.Card, type: REHEARSAL.type, parent: project.id!, title: 'Sectionals' },
      action: TransitionAction.Create,
    }, { wait: true })).card!

    const model = await suite.planning.model(card.id!)
    expect(model.schema().type).toBe(REHEARSAL.type)
    expect(model.available().map(rule => rule.name)).toEqual(['start', 'reset'])
  })

  test('a tree declared without definitions has none', async () => {
    const suite = await makeSuite()
    expect(suite.planning.definitions).toBeUndefined()
    expect(suite.client.planning().definitions).toBeUndefined()
  })
})
