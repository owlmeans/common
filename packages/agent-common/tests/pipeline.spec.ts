import { describe, expect, test } from 'bun:test'
import {
  orderPipelineSteps, pipelineDescendants, pipelineStep, validatePipelineSpec,
} from '../src/index.js'
import type { PipelineSpec } from '../src/index.js'

/**
 * The spec is the one thing in this family that is checked without a model, a slot or a network, so
 * every fault it can carry is pinned here. A spec fault that reaches the runner is a build error a
 * developer reads once; the same fault reaching a deployment is a pipeline that starts and then
 * cannot say why it did nothing.
 */

const spec = (steps: PipelineSpec['steps'], version = 1): PipelineSpec =>
  ({ alias: 'test', version, steps })

describe('agent-common — pipeline spec validation', () => {
  test('accepts a linear spec', () => {
    expect(() => validatePipelineSpec(spec([
      { step: 'a' }, { step: 'b', after: ['a'] }, { step: 'c', after: ['b'] },
    ]))).not.toThrow()
  })

  test('refuses an empty step list, an empty alias and a bad version at once', () => {
    expect(() => validatePipelineSpec({ alias: '', version: 0, steps: [] }))
      .toThrow(/alias is empty.*version.*no steps/s)
  })

  test('names EVERY fault in one message rather than the first', () => {
    let message = ''
    try {
      validatePipelineSpec(spec([
        { step: 'a' },
        { step: 'a' },
        { step: 'b', after: ['nope'] },
        { step: 'c', nonIdempotent: true, attempts: 3 },
      ]))
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('duplicate step "a"')
    expect(message).toContain('unknown step "nope"')
    expect(message).toContain('nonIdempotent')
  })

  test('refuses a step that waits on itself', () => {
    expect(() => validatePipelineSpec(spec([{ step: 'a', after: ['a'] }])))
      .toThrow(/declares itself/)
  })

  test('refuses a cycle', () => {
    expect(() => validatePipelineSpec(spec([
      { step: 'a', after: ['c'] }, { step: 'b', after: ['a'] }, { step: 'c', after: ['b'] },
    ]))).toThrow(/cycle/)
  })

  test('refuses attempts below one and a non-positive timeout', () => {
    expect(() => validatePipelineSpec(spec([{ step: 'a', attempts: 0 }]))).toThrow(/attempts/)
    expect(() => validatePipelineSpec(spec([{ step: 'a', timeout: 0 }]))).toThrow(/timeout/)
  })

  test('allows attempts above one on an idempotent step', () => {
    expect(() => validatePipelineSpec(spec([{ step: 'a', attempts: 3 }]))).not.toThrow()
  })
})

describe('agent-common — pipeline ordering', () => {
  test('respects `after` and keeps declaration order as the tie-break', () => {
    // `c` and `b` are both ready after `a`; declaration order decides, not a set's iteration.
    expect(orderPipelineSteps(spec([
      { step: 'a' }, { step: 'c', after: ['a'] }, { step: 'b', after: ['a'] },
    ]))).toEqual(['a', 'c', 'b'])
  })

  test('orders a fan-out/join graph so the join comes last', () => {
    const order = orderPipelineSteps(spec([
      { step: 'left' },
      { step: 'right' },
      { step: 'deeper', after: ['right'] },
      { step: 'join', after: ['left', 'deeper'] },
    ]))
    expect(order.indexOf('join')).toBe(3)
    expect(order.indexOf('deeper')).toBeGreaterThan(order.indexOf('right'))
  })

  test('is stable across calls', () => {
    const declared = spec([
      { step: 'a' }, { step: 'b' }, { step: 'c', after: ['a', 'b'] }, { step: 'd', after: ['a'] },
    ])
    expect(orderPipelineSteps(declared)).toEqual(orderPipelineSteps(declared))
  })

  test('throws on an unknown `after` and on a cycle', () => {
    expect(() => orderPipelineSteps(spec([{ step: 'a', after: ['ghost'] }]))).toThrow(/unknown step/)
    expect(() => orderPipelineSteps(spec([
      { step: 'a', after: ['b'] }, { step: 'b', after: ['a'] },
    ]))).toThrow(/cycle/)
  })
})

describe('agent-common — descendants', () => {
  const graph = spec([
    { step: 'a' },
    { step: 'b', after: ['a'] },
    { step: 'c', after: ['a'] },
    { step: 'd', after: ['b', 'c'] },
    { step: 'aside' },
  ])

  test('a step and everything that transitively waits on it, in order', () => {
    expect(pipelineDescendants(graph, 'b')).toEqual(['b', 'd'])
    expect(pipelineDescendants(graph, 'a')).toEqual(['a', 'b', 'c', 'd'])
  })

  test('leaves an unrelated branch alone', () => {
    expect(pipelineDescendants(graph, 'b')).not.toContain('aside')
  })

  test('refuses a step the spec does not declare', () => {
    expect(() => pipelineDescendants(graph, 'ghost')).toThrow(/pipeline-step/)
  })

  test('pipelineStep answers null rather than throwing', () => {
    expect(pipelineStep(graph, 'ghost')).toBeNull()
    expect(pipelineStep(graph, 'a')?.step).toBe('a')
  })
})
