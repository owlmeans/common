import { describe, expect, test } from 'bun:test'
import { IntrinsicStatus } from '../src/consts.js'
import { UnknownStatusFlow, UnknownWorkcardType } from '../src/errors.js'
import { PROJECT_TYPE, REVIEW_FLOW, STORY_FLOW, STORY_TYPE, TASK_TYPE, makeRegistry } from './fixtures.js'
import { statusHelper } from '../src/helpers/status.js'

const registry = makeRegistry()

describe('status flows', () => {
  test('every status maps onto its intrinsic state; the initial one is the marked one', () => {
    expect(statusHelper.intrinsicOf(STORY_FLOW, 'failed')).toBe(IntrinsicStatus.Planned)
    expect(statusHelper.intrinsicOf(STORY_FLOW, 'completed')).toBe(IntrinsicStatus.Closed)
    expect(statusHelper.intrinsicOf(STORY_FLOW, 'unknown')).toBeUndefined()
    expect(statusHelper.initialStatusOf(REVIEW_FLOW)).toBe('pending')
  })

  test('a repeated name picks the rule whose from matches, and a wildcard answers last', () => {
    expect(statusHelper.ruleOf(STORY_FLOW, 'start', 'failed')?.to).toBe('in-progress')
    expect(statusHelper.ruleOf(STORY_FLOW, 'start', 'completed')).toBeUndefined()
    expect(statusHelper.ruleOf(REVIEW_FLOW, 'reopen', 'approved')?.to).toBe('reviewing')
    expect(statusHelper.ruleOf(REVIEW_FLOW, 'reopen', 'reviewing')?.to).toBe('pending')
  })

  test('a status the flow does not declare matches every rule of the name, the first declared answering', () => {
    // A card whose flow changed under it: `abandoned` is no longer a status of the flow.
    expect(statusHelper.ruleOf(STORY_FLOW, 'start', 'abandoned')?.to).toBe('in-progress')
    expect(statusHelper.ruleOf(STORY_FLOW, 'complete', 'abandoned')?.to).toBe('completed')
    expect(statusHelper.ruleOf(STORY_FLOW, 'reset', 'abandoned')?.to).toBe('planned')
    expect(statusHelper.ruleOf(STORY_FLOW, 'nope', 'abandoned')).toBeUndefined()
    // A declared status keeps its own rules only.
    expect(statusHelper.ruleOf(STORY_FLOW, 'complete', 'planned')).toBeUndefined()
    expect(statusHelper.transitionsFrom(STORY_FLOW, 'abandoned').map(rule => rule.name)).toEqual(['start', 'complete', 'fail', 'reset'])
  })

  test('canTransit and transitionsFrom read the same rules, one per name', () => {
    expect(statusHelper.canTransit(STORY_FLOW, 'reset', 'planned')).toBe(true)
    expect(statusHelper.canTransit(STORY_FLOW, 'complete', 'planned')).toBe(false)
    expect(statusHelper.transitionsFrom(STORY_FLOW, 'in-progress').map(rule => rule.name)).toEqual(['complete', 'fail', 'reset'])
    expect(statusHelper.transitionsFrom(STORY_FLOW, 'failed', { explicit: true }).map(rule => `${rule.name}→${rule.to}`))
      .toEqual(['start→in-progress', 'reset→planned'])
  })
})

describe('intrinsic resolution', () => {
  test('primary policy reads the primary flow only', () => {
    expect(statusHelper.resolveIntrinsic(STORY_TYPE, { 'test:story': 'in-progress' }, registry)).toBe(IntrinsicStatus.InProgress)
    expect(statusHelper.resolveIntrinsic(PROJECT_TYPE, { 'test:story': 'completed' }, registry)).toBe(IntrinsicStatus.Closed)
  })

  test('IntrinsicPolicy.All takes the least advanced flow', () => {
    expect(statusHelper.resolveIntrinsic(TASK_TYPE, { 'test:story': 'completed', 'test:review': 'reviewing' }, registry))
      .toBe(IntrinsicStatus.InProgress)
    expect(statusHelper.resolveIntrinsic(TASK_TYPE, { 'test:story': 'completed', 'test:review': 'approved' }, registry))
      .toBe(IntrinsicStatus.Closed)
    expect(statusHelper.resolveIntrinsic(TASK_TYPE, { 'test:story': 'failed', 'test:review': 'approved' }, registry))
      .toBe(IntrinsicStatus.Planned)
  })

  test('initialFlowsOf starts every flow at its initial status, the primary at the draft status', () => {
    expect(statusHelper.initialFlowsOf(TASK_TYPE, registry)).toEqual({ 'test:story': 'planned', 'test:review': 'pending' })
    expect(statusHelper.initialFlowsOf(TASK_TYPE, registry, 'failed')).toEqual({ 'test:story': 'failed', 'test:review': 'pending' })
  })
})

describe('schema registry', () => {
  test('answers types and flows, refuses unknown ones, and round-trips a bundle', () => {
    expect(registry.primaryFlow(TASK_TYPE.type).id).toBe(STORY_FLOW.id)
    expect(() => registry.type('nope')).toThrow(UnknownWorkcardType)
    expect(() => registry.flow('nope')).toThrow(UnknownStatusFlow)

    const copy = makeRegistry()
    copy.load({ version: 1, types: [STORY_TYPE], flows: [STORY_FLOW] })
    expect(copy.types().map(type => type.type)).toEqual([STORY_TYPE.type])
    expect(copy.has(TASK_TYPE.type)).toBe(false)
  })

  test('compiles and caches a validator for a type\'s fields', () => {
    const validate = registry.validator(STORY_TYPE.type)

    expect(validate({ area: 'user', primary: true })).toBe(true)
    expect(validate({ area: 'moon', primary: true })).toBe(false)
    expect(registry.validator(STORY_TYPE.type)).toBe(validate)
  })
})
