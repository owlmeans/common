import { describe, expect, test } from 'bun:test'
import { applyQuery } from '@owlmeans/resource'
import { CommitState, TransitionAction, WorkcardKind } from '../src/consts.js'
import { WorkcardNotFound } from '../src/errors.js'
import { applyTransition } from '../src/helpers/apply.js'
import { computeChanges, isEmptyChange } from '../src/helpers/changes.js'
import { criteriaOf, summaryOf } from '../src/helpers/query.js'
import { currentSpecification, slotOf } from '../src/helpers/specification.js'
import { makeProjectModel, makeWorkcardModel, modelOf } from '../src/models/index.js'
import type {
  PlanningFacade, Project, Specification, TransitionExecution, Workcard, WorkcardDraft,
} from '../src/types.js'
import { AT, ENTITY, PROJECT_TYPE, STORY_TYPE, makeRegistry } from './fixtures.js'

/**
 * The smallest facade the models can run against: maps, folded synchronously with the package's
 * own helpers. It records every execution so a spec can read what a model sent.
 */
const makeFacade = () => {
  const schemas = makeRegistry()
  const cards = new Map<string, Workcard>()
  const executed: TransitionExecution[] = []
  let next = 0

  const facade: PlanningFacade = {
    scope: { entityId: ENTITY },
    schemas,
    cards: {
      get: async id => cards.get(id) ?? Promise.reject(new WorkcardNotFound(id)),
      load: async id => cards.get(id) ?? null,
      list: async query => applyQuery([...cards.values()], criteriaOf(query, facade.scope)),
      count: async query => applyQuery([...cards.values()], criteriaOf(query, facade.scope)).total,
      summary: async (parents, query) =>
        summaryOf(applyQuery([...cards.values()], criteriaOf(query, facade.scope)).items, parents),
    },
    specifications: {
      current: async (parent, category) => currentSpecification([...cards.values()].filter(card => card.parent === parent), category),
      list: async parent => applyQuery([...cards.values()], { parent, kind: WorkcardKind.Specification }) as never,
      get: async id => cards.get(id) as Specification,
      revisions: async () => [],
    },
    relationships: { list: async () => ({ items: [], total: 0 }) },
    transitions: { get: async id => Promise.reject(new WorkcardNotFound(id)), list: async () => ({ items: [], total: 0 }) },
    commits: {
      status: async transition => ({ transition, state: CommitState.Committed }),
      subscribe: () => () => undefined,
      wait: async () => null,
    },
    execute: async exec => {
      executed.push(exec)
      const card = typeof exec.card === 'string' ? cards.get(exec.card) : undefined
      const draft = typeof exec.card === 'string' ? undefined : exec.card as WorkcardDraft
      const type = schemas.type(card?.type ?? draft!.type)
      const parent = cards.get(card?.parent ?? draft?.parent ?? '')
      const category = (card as Specification | undefined)?.category ?? draft?.category
      const slot = parent != null && category != null ? slotOf(schemas.type(parent.type), category) : undefined
      const set = computeChanges(card, exec, type, schemas, AT, { slot })
      const id = card?.id ?? `card-${++next}`
      const transition = {
        id: `t-${++next}`, entityId: ENTITY, card: id, kind: card?.kind ?? draft!.kind, type: type.type,
        seq: (card?.head ?? card?.seq ?? 0) + 1, action: exec.action, changes: set.changes, unset: set.unset,
        actor: {}, at: AT, commit: { state: CommitState.Committed },
      }
      if (exec.action === TransitionAction.Update && isEmptyChange(set)) {
        return { transition, card, committed: async () => card ?? null }
      }
      const folded = applyTransition(card, transition)
      folded == null ? cards.delete(id) : cards.set(id, folded)
      return { transition, card: folded, committed: async () => folded }
    },
    model: async card => modelOf(typeof card === 'string' ? await facade.cards.get(card) as never : card, facade),
  }

  const seed = async (draft: WorkcardDraft): Promise<Workcard> =>
    (await facade.execute({ action: TransitionAction.Create, card: draft })).card!

  return { facade, executed, cards, seed }
}

describe('workcard model', () => {
  test('expectSeq defaults to the head, then the seq; null opts out and a given value wins', async () => {
    const { facade, executed, seed } = makeFacade()
    const card = await seed({ kind: WorkcardKind.Card, type: STORY_TYPE.type, title: 'Story', fields: { area: 'user', primary: false } })

    await makeWorkcardModel({ ...card, head: 4 }, facade).update({ title: 'A' })
    await makeWorkcardModel(card, facade).transit('start')
    await makeWorkcardModel(card, facade).link('follows', 'x', undefined, { expectSeq: 9 })
    await makeWorkcardModel(card, facade).remove({ expectSeq: null })

    expect(executed.slice(1).map(exec => exec.expectSeq)).toEqual([4, 1, 9, null])
    expect(executed[2]).toMatchObject({ card: card.id, action: TransitionAction.Transit, transition: 'start' })
  })

  test('can and available answer from the registry with no I/O', async () => {
    const { facade, seed } = makeFacade()
    const model = makeWorkcardModel(await seed({ kind: WorkcardKind.Card, type: STORY_TYPE.type, title: 'Story', fields: { area: 'user', primary: false } }), facade)

    expect(model.can('start')).toBe(true)
    expect(model.can('complete')).toBe(false)
    expect(model.available().map(rule => rule.name)).toEqual(['start', 'reset'])
    expect(model.pending()).toBe(false)
  })
})

describe('write', () => {
  test('creates the slot\'s document when empty and revises the same record when filled', async () => {
    const { facade, executed, cards, seed } = makeFacade()
    const project = await seed({ kind: WorkcardKind.Project, type: PROJECT_TYPE.type, title: 'Shop' })
    const model = makeProjectModel(project as Project, facade)

    // The spec type is resolved from the registry: the only specification type registered.
    const first = await model.write('scaffold', '{"a":1}')
    const second = await model.write('scaffold', '{"a":2}')
    const specs = [...cards.values()].filter(card => card.kind === WorkcardKind.Specification) as Specification[]

    expect(executed.slice(1).map(exec => exec.action)).toEqual([TransitionAction.Create, TransitionAction.Update])
    expect(executed[1].card).toMatchObject({ kind: WorkcardKind.Specification, type: 'test:spec', parent: project.id, category: 'scaffold', format: 'json' })
    expect(executed[2]).toMatchObject({ card: first.card!.id, expectSeq: 1, changes: { body: '{"a":2}' } })
    expect(specs.map(spec => [spec.revision, spec.body])).toEqual([[2, '{"a":2}']])
    expect(second.card!.id).toBe(first.card!.id)
  })

  test('a project model summarises its direct cards', async () => {
    const { facade, seed } = makeFacade()
    const project = await seed({ kind: WorkcardKind.Project, type: PROJECT_TYPE.type, title: 'Shop' })
    await seed({ kind: WorkcardKind.Card, type: STORY_TYPE.type, parent: project.id, title: 'Story', fields: { area: 'user', primary: false } })

    const model = await facade.model(project) as unknown as ReturnType<typeof makeProjectModel>

    expect(await model.summary()).toEqual({ total: 1, planned: 1, 'in-progress': 0, closed: 0 })
    expect((await model.cards()).total).toBe(1)
  })
})
