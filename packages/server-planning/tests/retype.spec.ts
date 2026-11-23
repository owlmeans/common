import { describe, expect, test } from 'bun:test'
import {
  CardTypeNotAllowed, CodeScope, CodeStyle, FieldsInvalid, IntrinsicStatus, LabelNotAllowed, PlanningError,
  RelationshipRefused, RetypeNotAllowed, SpecificationFormat, TransitionAction, WorkcardKind,
} from '@owlmeans/planning'
import type { AnyTypeSchema, PlanningFacade, PlanningPlugin, StatusFlowSchema, Workcard } from '@owlmeans/planning'
import { makeTestPlanning, SPEC } from './context.js'

const PROJECT = 'rt:project'
const STORY = 'rt:story'
const FEATURE = 'rt:feature'
const TASK = 'rt:task'
const NOTE = 'rt:note'
const STRICT = 'rt:strict'

const fields = (extra: Record<string, unknown> = {}) => ({
  type: 'object',
  properties: { area: { type: 'string' }, formerCodes: { type: 'array', items: { type: 'string' } }, ...extra },
  additionalProperties: false,
})

const flows: StatusFlowSchema[] = [
  {
    id: 'rt:work', version: 1,
    statuses: [
      { key: 'planned', intrinsic: IntrinsicStatus.Planned, initial: true },
      { key: 'doing', intrinsic: IntrinsicStatus.InProgress },
      { key: 'done', intrinsic: IntrinsicStatus.Closed },
    ],
    transitions: [{ name: 'start', from: ['planned'], to: 'doing' }, { name: 'finish', from: ['doing'], to: 'done' }],
  },
  {
    id: 'rt:short', version: 1,
    statuses: [{ key: 'planned', intrinsic: IntrinsicStatus.Planned, initial: true }],
    transitions: [],
  },
]

const design = { category: 'design', format: SpecificationFormat.Json, type: SPEC }
const code = (prefix: string) => ({ prefix, style: CodeStyle.Random, length: 5, uppercase: true, uniqueWithin: CodeScope.Parent })

const types: AnyTypeSchema[] = [
  {
    type: PROJECT, kind: WorkcardKind.Project, version: 1, fields: { type: 'object' }, flows: ['rt:short'],
    specifications: [], cardTypes: [STORY, FEATURE, TASK, NOTE, STRICT],
  },
  {
    type: STORY, kind: WorkcardKind.Card, version: 1, fields: fields({ primary: { type: 'boolean' } }), flows: ['rt:work'],
    specifications: [design], code: code('S-'), labels: ['ui', 'api'],
    relationships: [{ name: 'follows', to: [STORY, FEATURE], single: true }, { name: 'blocks', from: [STORY], to: [STORY] }],
    retypes: [FEATURE, TASK, NOTE, STRICT],
  },
  {
    type: FEATURE, kind: WorkcardKind.Card, version: 1, fields: fields(), flows: ['rt:work'],
    specifications: [design, { category: 'plan', format: SpecificationFormat.Json, type: SPEC }], code: code('F-'),
    relationships: [{ name: 'follows', to: [STORY, FEATURE], single: true }],
    children: { types: [STORY] }, retypes: [STORY, TASK],
  },
  {
    // No slots, no links, no area: what a retype must not lose.
    type: TASK, kind: WorkcardKind.Card, version: 1,
    fields: { type: 'object', additionalProperties: false, properties: { formerCodes: { type: 'array', items: { type: 'string' } } } },
    flows: ['rt:work'], specifications: [], code: code('T-'),
  },
  {
    // Another flow: a card in `doing` has no status there.
    type: NOTE, kind: WorkcardKind.Card, version: 1, fields: fields(), flows: ['rt:short'], specifications: [design],
  },
  {
    type: STRICT, kind: WorkcardKind.Card, version: 1, fields: fields(), flows: ['rt:work'], specifications: [design],
    code: code('S-'), labels: ['api'], relationships: [{ name: 'follows', to: [STORY, FEATURE], single: true }, { name: 'blocks', to: [STORY] }],
  },
]

const plugin: PlanningPlugin = { name: 'retype-fixtures', order: 1, schemas: { types, flows } }

const setup = async () => {
  const { facade, store } = await makeTestPlanning({ plugins: [plugin] })
  const planning = facade()
  const project = (await planning.execute({
    card: { kind: WorkcardKind.Project, type: PROJECT, title: 'Retypes', code: 'retypes' }, action: TransitionAction.Create,
  }, { wait: true })).card!
  const card = async (type: string, title: string, extra: Record<string, unknown> = {}): Promise<Workcard> => (await planning.execute({
    card: { kind: WorkcardKind.Card, type, parent: project.id!, title, ...extra }, action: TransitionAction.Create,
  }, { wait: true })).card!

  return { planning, project, card, store }
}

const refusal = async (planning: PlanningFacade, run: () => Promise<unknown>, card: string): Promise<unknown> => {
  const before = (await planning.transitions.list({ card })).total
  const error = await run().then(() => null, (e: unknown) => e)
  expect((await planning.transitions.list({ card })).total).toBe(before)
  return error
}

describe('@owlmeans/server-planning — retype', () => {
  test('a listed type becomes the record\'s type; the code is re-minted and the old one kept', async () => {
    const { planning, card } = await setup()
    const story = await card(STORY, 'Sign in', { fields: { area: 'user' } })

    const receipt = await planning.execute({ card: story.id!, action: TransitionAction.Retype, toType: FEATURE }, { wait: true })

    expect(receipt.transition.action).toBe(TransitionAction.Retype)
    expect(receipt.transition.type).toBe(FEATURE)
    expect(receipt.card!.type).toBe(FEATURE)
    expect(receipt.card!.code).toMatch(/^F-[0-9A-Z]{5}$/)
    expect(receipt.card!.fields).toEqual({ area: 'user', formerCodes: [story.code] })
    expect([receipt.card!.status, receipt.card!.intrinsic, receipt.card!.seq]).toEqual(['planned', IntrinsicStatus.Planned, 2])
    const log = await planning.transitions.list({ card: story.id!, sort: ['seq'] })
    expect(log.items.map(row => row.type)).toEqual([STORY, FEATURE])
    expect((await planning.cards.get(story.id!)).type).toBe(FEATURE)

    // Back again: the former codes accumulate, oldest first.
    const back = await planning.execute({ card: story.id!, action: TransitionAction.Retype, toType: STORY }, { wait: true })
    expect(back.card!.code).toMatch(/^S-/)
    expect(back.card!.fields.formerCodes).toEqual([story.code, receipt.card!.code])
  })

  test('the model retypes with fields fitted to the new type', async () => {
    const { planning, card } = await setup()
    const story = await card(STORY, 'Export', { fields: { area: 'user', primary: true } })

    const model = await planning.model(story)
    // `primary` is not a feature field: the new type refuses it until it is cleared.
    expect(await refusal(planning, async () => await model.retype(FEATURE), story.id!)).toBeInstanceOf(FieldsInvalid)
    const receipt = await model.retype(FEATURE, { title: 'Export reports' }, { unset: ['fields.primary'], wait: true })

    expect(receipt.card!.type).toBe(FEATURE)
    expect(receipt.card!.title).toBe('Export reports')
    expect(receipt.card!.fields).toEqual({ area: 'user', formerCodes: [story.code] })
  })

  test('a type the current one does not list, the same type or a malformed retype is refused', async () => {
    const { planning, card } = await setup()
    const task = await card(TASK, 'Configure')
    const story = await card(STORY, 'Sign in')

    expect(await refusal(planning, async () => await planning.execute({ card: task.id!, action: TransitionAction.Retype, toType: STORY }), task.id!))
      .toBeInstanceOf(RetypeNotAllowed)
    expect(await refusal(planning, async () => await planning.execute({ card: story.id!, action: TransitionAction.Retype, toType: STORY }), story.id!))
      .toBeInstanceOf(RetypeNotAllowed)
    const missing = await refusal(planning, async () => await planning.execute({ card: story.id!, action: TransitionAction.Retype }), story.id!)
    expect((missing as Error).message).toContain('malformed:retype-without-type')
    const stray = await refusal(planning, async () => await planning.execute({ card: story.id!, action: TransitionAction.Update, toType: FEATURE, changes: { title: 'x' } }), story.id!)
    expect((stray as Error).message).toContain('malformed:to-type-outside-retype')
    const named = await refusal(planning, async () => await planning.execute({ card: story.id!, action: TransitionAction.Retype, toType: FEATURE, changes: { code: 'F-AAAAA' } }), story.id!)
    expect(named).toBeInstanceOf(PlanningError)
    expect((named as Error).message).toContain('immutable:code')
    const moved = await refusal(planning, async () => await planning.execute({ card: story.id!, action: TransitionAction.Retype, toType: FEATURE, changes: { parents: [] } }), story.id!)
    expect((moved as Error).message).toContain('malformed:retype-moves-parent')
  })

  test('a status the new type\'s flow lacks, or a document its slots lack, is refused', async () => {
    const { planning, card } = await setup()
    const story = await card(STORY, 'Run')
    await planning.execute({ card: story.id!, action: TransitionAction.Transit, transition: 'start' }, { wait: true })

    expect(await refusal(planning, async () => await planning.execute({ card: story.id!, action: TransitionAction.Retype, toType: NOTE }), story.id!))
      .toBeInstanceOf(RetypeNotAllowed)

    const documented = await card(STORY, 'Documented')
    await (await planning.model(documented)).write('design', '{"screens":[]}', { wait: true })
    const error = await refusal(planning, async () => await planning.execute({ card: documented.id!, action: TransitionAction.Retype, toType: TASK }), documented.id!)
    expect(error).toBeInstanceOf(RetypeNotAllowed)
    expect((error as Error).message).toContain('document:design')
  })

  test('a container whose member the new type does not admit cannot be retyped', async () => {
    const { planning, project, card } = await setup()
    const feature = await card(FEATURE, 'Reports')
    await card(STORY, 'Member', { parents: [project.id!, feature.id!] })

    expect(await refusal(planning, async () => await planning.execute({ card: feature.id!, action: TransitionAction.Retype, toType: STORY }), feature.id!))
      .toBeInstanceOf(CardTypeNotAllowed)

    const empty = await card(FEATURE, 'Empty')
    expect((await planning.execute({ card: empty.id!, action: TransitionAction.Retype, toType: STORY }, { wait: true })).card!.type).toBe(STORY)
  })

  test('a member cannot become a type its container does not admit', async () => {
    const { planning, project, card } = await setup()
    const feature = await card(FEATURE, 'Reports')
    const member = await card(STORY, 'Member', { parents: [project.id!, feature.id!] })

    expect(await refusal(planning, async () => await planning.execute({ card: member.id!, action: TransitionAction.Retype, toType: TASK }), member.id!))
      .toBeInstanceOf(CardTypeNotAllowed)
  })

  test('labels and links must fit the new type from either end', async () => {
    const { planning, card } = await setup()
    const labelled = await card(STORY, 'Labelled', { labels: ['ui'] })
    expect(await refusal(planning, async () => await planning.execute({ card: labelled.id!, action: TransitionAction.Retype, toType: STRICT }), labelled.id!))
      .toBeInstanceOf(LabelNotAllowed)

    const anchor = await card(STORY, 'Anchor')
    const linked = await card(STORY, 'Linked', { fields: { area: 'user' } })
    await planning.execute({ card: linked.id!, action: TransitionAction.Link, link: { type: 'follows', to: anchor.id! } }, { wait: true })
    // `follows` is declared on a task by no rule at all.
    expect(await refusal(planning, async () => await planning.execute({ card: linked.id!, action: TransitionAction.Retype, toType: TASK }), linked.id!))
      .toBeInstanceOf(RelationshipRefused)
    // The anchor is the target of a story's `follows`, which admits stories and features — a feature passes.
    expect((await planning.execute({ card: anchor.id!, action: TransitionAction.Retype, toType: FEATURE }, { wait: true })).card!.type).toBe(FEATURE)

    const blocker = await card(STORY, 'Blocker')
    const blocked = await card(STORY, 'Blocked')
    await planning.execute({ card: blocker.id!, action: TransitionAction.Link, link: { type: 'blocks', to: blocked.id! } }, { wait: true })
    // A story's `blocks` runs only to stories: the blocked card cannot become a strict card.
    expect(await refusal(planning, async () => await planning.execute({ card: blocked.id!, action: TransitionAction.Retype, toType: STRICT }), blocked.id!))
      .toBeInstanceOf(RelationshipRefused)
    // The blocker may: a strict card's own `blocks` admits it at the `from` end.
    expect((await planning.execute({ card: blocker.id!, action: TransitionAction.Retype, toType: STRICT }, { wait: true })).card!.type).toBe(STRICT)
  })

  test('a code that already carries the new prefix is kept', async () => {
    const { planning, card } = await setup()
    const story = await card(STORY, 'Same prefix')

    const receipt = await planning.execute({ card: story.id!, action: TransitionAction.Retype, toType: STRICT }, { wait: true })

    expect(receipt.card!.code).toBe(story.code)
    expect(receipt.card!.fields.formerCodes).toBeUndefined()
  })
})
