import { describe, expect, test } from 'bun:test'
import { IntrinsicStatus, TransitionAction, WorkcardKind } from '../src/consts.js'
import { IllegalTransition, PlanningError } from '../src/errors.js'
import { applyRelationship, applyTransition } from '../src/helpers/apply.js'
import { assertMutable, computeChanges, isEmptyChange } from '../src/helpers/changes.js'
import type { Relationship, Specification, Workcard } from '../src/types.js'
import {
  AT, ENTITY, LATER, PROJECT_TYPE, SPEC_TYPE, STORY_TYPE, TASK_TYPE, makeRegistry, transitionOf,
} from './fixtures.js'

const registry = makeRegistry()

const created = (): Workcard => {
  const { changes } = computeChanges(undefined, {
    action: TransitionAction.Create,
    card: {
      kind: WorkcardKind.Card, type: STORY_TYPE.type, parent: 'p1', title: 'As a user I sign in',
      fields: { area: 'user', primary: false }, code: 'US-ABCDE',
    },
  }, STORY_TYPE, registry, AT)

  return applyTransition(undefined, transitionOf({ card: 'c1', seq: 1, action: TransitionAction.Create, changes }))!
}

describe('applyTransition — the fold', () => {
  test('create builds the whole record from the changes and the transition identity', () => {
    const card = created()

    expect(card).toEqual({
      id: 'c1', kind: WorkcardKind.Card, type: STORY_TYPE.type, entityId: ENTITY,
      title: 'As a user I sign in', code: 'US-ABCDE', parent: 'p1', parents: ['p1'], labels: [],
      fields: { area: 'user', primary: false }, flows: { 'test:story': 'planned' },
      status: 'planned', intrinsic: IntrinsicStatus.Planned,
      seq: 1, head: 1, createdAt: AT, updatedAt: AT,
    })
  })

  test('update merges fields, replaces the rest, clears unset — and never mutates its input', () => {
    const card = created()
    const before = structuredClone(card)
    const next = applyTransition(card, transitionOf({
      card: 'c1', seq: 2, action: TransitionAction.Update, at: LATER,
      changes: { title: 'Renamed', fields: { warning: 'x' }, labels: ['ui'] },
      unset: ['code', 'fields.primary'],
    }))!

    expect(card).toEqual(before)
    expect(next.title).toBe('Renamed')
    expect(next.fields).toEqual({ area: 'user', warning: 'x' })
    expect(next.labels).toEqual(['ui'])
    expect(next.code).toBeUndefined()
    expect([next.seq, next.head, next.updatedAt, next.createdAt]).toEqual([2, 2, LATER, AT])
  })

  test('an applied seq returns the card unchanged; a gap or a missing card is refused', () => {
    const card = { ...created(), head: 3 }

    expect(applyTransition(card, transitionOf({ card: 'c1', seq: 1, action: TransitionAction.Update }))).toBe(card)
    expect(() => applyTransition(card, transitionOf({ card: 'c1', seq: 3, action: TransitionAction.Update })))
      .toThrow(PlanningError)
    expect(() => applyTransition(undefined, transitionOf({ card: 'c1', seq: 2, action: TransitionAction.Update })))
      .toThrow('fold:out-of-order')
    expect(applyTransition({ ...card, seq: 1 }, transitionOf({ card: 'c1', seq: 2, action: TransitionAction.Link, at: LATER })))
      .toMatchObject({ seq: 2, head: 3, updatedAt: LATER, title: card.title })
  })

  test('delete answers null, and a revised document carries its new revision', () => {
    const card = created()
    expect(applyTransition(card, transitionOf({ card: 'c1', seq: 2, action: TransitionAction.Delete }))).toBeNull()

    const spec = { ...card, kind: WorkcardKind.Specification, category: 'design', format: 'json', body: '{}', revision: 1 } as Specification
    const { changes } = computeChanges(spec, { card: 'c1', action: TransitionAction.Update, changes: { body: '{"a":1}' } },
      SPEC_TYPE, registry, LATER, { slot: STORY_TYPE.specifications[0] })
    const revised = applyTransition(spec, transitionOf({ card: 'c1', seq: 2, action: TransitionAction.Update, changes })) as Specification

    expect([revised.revision, revised.body, revised.bodyChars]).toEqual([2, '{"a":1}', 7])
  })
})

describe('applyRelationship', () => {
  test('a create folds its links, from the card unless a draft names another end', () => {
    const links = applyRelationship([], transitionOf({
      id: 't1', card: 'c2', seq: 1, action: TransitionAction.Create, project: 'p1',
      links: [{ type: 'follows', to: 'c1' }, { type: 'follows', from: 'c0', to: 'c2' }],
    }))

    expect(links).toEqual([
      { entityId: ENTITY, type: 'follows', from: 'c2', to: 'c1', project: 'p1', createdAt: AT, transition: 't1' },
      { entityId: ENTITY, type: 'follows', from: 'c0', to: 'c2', project: 'p1', createdAt: AT, transition: 't1' },
    ])
  })

  test('link is idempotent and unlink removes only the matching edge', () => {
    const link = transitionOf({ card: 'c2', seq: 2, action: TransitionAction.Link, link: { type: 'follows', to: 'c1' } })
    const once = applyRelationship([], link)
    const twice = applyRelationship(once, link)
    const other = applyRelationship(twice, { ...link, link: { type: 'blocks', to: 'c1' } })

    expect(twice).toHaveLength(1)
    expect(applyRelationship(other, { ...link, action: TransitionAction.Unlink }).map(edge => edge.type))
      .toEqual(['blocks'])
  })

  test('a delete removes every edge touching the card and keeps the rest', () => {
    const edge = (from: string, to: string): Relationship => ({ entityId: ENTITY, type: 'follows', from, to, createdAt: AT })
    const links = [edge('c1', 'c2'), edge('c3', 'c1'), edge('c3', 'c4')]

    expect(applyRelationship(links, transitionOf({ card: 'c1', seq: 5, action: TransitionAction.Delete })))
      .toEqual([edge('c3', 'c4')])
  })
})

describe('computeChanges', () => {
  test('an update records only what differs, and one that changes nothing is empty', () => {
    const card = created()
    const set = computeChanges(card, {
      card: 'c1', action: TransitionAction.Update,
      changes: { title: card.title, description: 'New', fields: { area: 'user', primary: true } },
    }, STORY_TYPE, registry, LATER)

    expect(set).toEqual({ changes: { description: 'New', fields: { primary: true } }, unset: [] })
    expect(isEmptyChange(computeChanges(card, {
      card: 'c1', action: TransitionAction.Update, changes: { title: card.title, code: null as never },
    }, STORY_TYPE, registry, LATER))).toBe(false)
    expect(isEmptyChange(computeChanges(card, {
      card: 'c1', action: TransitionAction.Update, changes: { title: card.title, description: null as never },
    }, STORY_TYPE, registry, LATER))).toBe(true)
  })

  test('a transit moves the flow, mirrors status and intrinsic, and sets or clears closedAt', () => {
    const card = { ...created(), status: 'in-progress', flows: { 'test:story': 'in-progress' }, intrinsic: IntrinsicStatus.InProgress }
    const completed = computeChanges(card, { card: 'c1', action: TransitionAction.Transit, transition: 'complete' }, STORY_TYPE, registry, LATER)

    expect(completed).toEqual({
      changes: { flows: { 'test:story': 'completed' }, status: 'completed', intrinsic: IntrinsicStatus.Closed, closedAt: LATER },
      unset: [], flow: 'test:story', from: 'in-progress', to: 'completed',
    })

    const closed = { ...card, status: 'completed', flows: { 'test:story': 'completed' }, intrinsic: IntrinsicStatus.Closed, closedAt: LATER }
    expect(computeChanges(closed, { card: 'c1', action: TransitionAction.Transit, transition: 'reset' }, STORY_TYPE, registry, LATER).unset)
      .toEqual(['closedAt'])
    expect(() => computeChanges(closed, { card: 'c1', action: TransitionAction.Transit, transition: 'start' }, STORY_TYPE, registry, LATER))
      .toThrow(IllegalTransition)
  })

  test('a non-primary transit under IntrinsicPolicy.All keeps the card open until every flow closes', () => {
    const task = { ...created(), type: TASK_TYPE.type, status: 'completed', intrinsic: IntrinsicStatus.Planned,
      flows: { 'test:story': 'completed', 'test:review': 'reviewing' } }
    const set = computeChanges(task, { card: 'c1', action: TransitionAction.Transit, transition: 'approve', flow: 'test:review' },
      TASK_TYPE, registry, LATER)

    expect(set.changes).toEqual({ flows: { 'test:review': 'approved' }, intrinsic: IntrinsicStatus.Closed, closedAt: LATER })
  })

  test('a create of a revisioned document starts at revision 1 with its body length', () => {
    const { changes } = computeChanges(undefined, {
      action: TransitionAction.Create,
      card: { kind: WorkcardKind.Specification, type: SPEC_TYPE.type, parent: 'p1', title: 'scaffold', category: 'scaffold', body: '{}' },
    }, SPEC_TYPE, registry, AT, { slot: PROJECT_TYPE.specifications[1] })

    expect(changes).toMatchObject({ category: 'scaffold', format: 'json', body: '{}', bodyChars: 2, revision: 1, parents: ['p1'] })
  })
})

describe('assertMutable', () => {
  test('status moves only through transit, a fixed code stays fixed, derived fields are never supplied', () => {
    expect(() => assertMutable({ card: 'c1', action: TransitionAction.Update, changes: { status: 'completed' } }, STORY_TYPE))
      .toThrow('immutable:status')
    expect(() => assertMutable({ card: 'c1', action: TransitionAction.Update, changes: { code: 'US-X' } }, STORY_TYPE))
      .toThrow('immutable:code')
    expect(() => assertMutable({ card: 'c1', action: TransitionAction.Update, unset: ['title'] }, STORY_TYPE))
      .toThrow('immutable:title')
    expect(() => assertMutable({ card: 'c1', action: TransitionAction.Update, changes: { code: 'free' } }, TASK_TYPE))
      .not.toThrow()
  })
})
