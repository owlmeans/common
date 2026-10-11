import { describe, expect, test } from 'bun:test'
import {
  FieldsInvalid, SpecificationFormat, SpecificationRevisionConflict, SpecificationSlotUnknown, TransitionAction, WorkcardKind,
} from '@owlmeans/planning'
import type { Specification } from '@owlmeans/planning'
import { createProject, makeTestPlanning, SPEC } from './context.js'

describe('@owlmeans/server-planning — specifications', () => {
  test('a revisioned slot written twice is revision 1 then 2 on one record', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await planning.model(await createProject(planning))

    const first = (await project.write('plan', JSON.stringify({ steps: [1] }), { wait: true })).card as Specification
    const second = (await (await project.reload()).write('plan', JSON.stringify({ steps: [1, 2] }), { wait: true })).card as Specification

    expect(first.revision).toBe(1)
    expect(second.id).toBe(first.id!)
    expect(second.revision).toBe(2)
    expect((await planning.specifications.list(project.id)).total).toBe(1)
    expect((await planning.specifications.current(project.id, 'plan'))!.body).toBe(JSON.stringify({ steps: [1, 2] }))
  })

  test('revisions() replays every body from the log, newest first', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await planning.model(await createProject(planning))
    const spec = (await project.write('plan', '{"steps":["a"]}', { wait: true })).card!
    await (await project.reload()).write('plan', '{"steps":["a","b"]}', { wait: true })

    const revisions = await planning.specifications.revisions(spec.id!)

    expect(revisions.map(entry => [entry.revision, entry.body])).toEqual([[2, '{"steps":["a","b"]}'], [1, '{"steps":["a"]}']])
    expect(revisions[0].by?.channel).toBe('test')
  })

  test('a second document for a slot that holds one is SpecificationRevisionConflict', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await createProject(planning)
    const create = (body: string) => planning.execute({
      card: { kind: WorkcardKind.Specification, type: SPEC, parent: project.id!, title: 'Brief', category: 'brief', body },
      action: TransitionAction.Create,
    }, { wait: true })

    await create('# one')

    await expect(create('# two')).rejects.toBeInstanceOf(SpecificationRevisionConflict)
    expect((await planning.specifications.current(project.id!, 'brief'))!.body).toBe('# one')
  })

  test('an undeclared slot and a body outside the slot schema are refused', async () => {
    const { facade } = await makeTestPlanning()
    const planning = facade()
    const project = await planning.model(await createProject(planning))

    await expect(project.write('roadmap', 'text')).rejects.toBeInstanceOf(SpecificationSlotUnknown)
    await expect(project.write('plan', '{"steps":1}')).rejects.toBeInstanceOf(FieldsInvalid)
    await expect(project.write('plan', 'not json', { format: SpecificationFormat.Json })).rejects.toBeInstanceOf(FieldsInvalid)
  })
})
