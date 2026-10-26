import { describe, expect, test } from 'bun:test'
import { PipelineRunStatus } from '@owlmeans/agent-common'
import type { PipelineSpec } from '@owlmeans/agent-common'
import { createMemoryPipelineRunStore, makePipeline } from '../src/index.js'
import type { PipelineStep } from '../src/index.js'

/**
 * The runner, offline. No model, no network, no storage beyond the in-memory port.
 *
 * Every one of these pins a property a crashed run depends on, and the two that matter most are at
 * the bottom of the file: a failing step reports rather than throws, and a fatal error escapes.
 */

interface State extends Record<string, unknown> {
  seen?: string[]
  value?: number
}

interface Deps { log: string[] }

const spec = (steps: PipelineSpec['steps'], alias = 'test'): PipelineSpec =>
  ({ alias, version: 1, steps })

const step = (
  name: string, body?: PipelineStep<State, Deps>['run'], skipWhen?: PipelineStep<State, Deps>['skipWhen'],
): PipelineStep<State, Deps> => ({
  step: name,
  ...(skipWhen != null ? { skipWhen } : {}),
  run: body ?? (async (_state, ctx) => { ctx.deps.log.push(name) }),
})

const args = (log: string[] = []) => ({ runId: 'run-1', deps: { log }, scope: 'project-1' })

describe('agent — pipeline construction', () => {
  test('refuses a declared step with no handler, and a handler for an undeclared step', () => {
    expect(() => makePipeline<State, Deps>(spec([{ step: 'a' }, { step: 'b', after: ['a'] }]), {
      steps: [step('a'), step('c')],
    })).toThrow(/declared step "b" has no handler.*handler for undeclared step "c"|handler for undeclared step "c".*declared step "b" has no handler/s)
  })

  test('refuses two handlers for one step', () => {
    expect(() => makePipeline<State, Deps>(spec([{ step: 'a' }]), {
      steps: [step('a'), step('a')],
    })).toThrow(/two handlers/)
  })

  test('refuses an `after` naming an unknown step and a cycle', () => {
    expect(() => makePipeline<State, Deps>(spec([{ step: 'a', after: ['ghost'] }]), {
      steps: [step('a')],
    })).toThrow(/unknown step/)
  })

  test('refuses attempts above one on a nonIdempotent step', () => {
    expect(() => makePipeline<State, Deps>(
      spec([{ step: 'a', nonIdempotent: true, attempts: 2 }]), { steps: [step('a')] },
    )).toThrow(/nonIdempotent/)
  })
})

describe('agent — pipeline execution', () => {
  test('runs a linear graph in order and returns the merged state', async () => {
    const log: string[] = []
    const pipeline = makePipeline<State, Deps>(
      spec([{ step: 'a' }, { step: 'b', after: ['a'] }, { step: 'c', after: ['b'] }]),
      {
        steps: [
          step('a', async () => ({ value: 1 })),
          step('b', async state => ({ value: (state.value ?? 0) + 1 })),
          step('c', async state => ({ value: (state.value ?? 0) + 1 })),
        ],
        runs: createMemoryPipelineRunStore(),
      },
    )

    const result = await pipeline.invoke({}, args(log))

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(result.completed).toEqual(['a', 'b', 'c'])
    expect(result.state.value).toBe(3)
    expect(result.pending).toEqual([])
  })

  test('joins only after BOTH branches of a fan-out have finished', async () => {
    // The init pipeline's real shape. A join implemented as two separate edges would run as soon
    // as the first branch finished, with the other's output missing from the state.
    const log: string[] = []
    const pipeline = makePipeline<State, Deps>(
      spec([
        { step: 'left' },
        { step: 'right' },
        { step: 'deeper', after: ['right'] },
        { step: 'join', after: ['left', 'deeper'] },
      ]),
      {
        steps: [
          step('left', async (_s, ctx) => { await Promise.resolve(); ctx.deps.log.push('left') }),
          step('right'),
          step('deeper'),
          step('join', async (_s, ctx) => { ctx.deps.log.push(`join:${ctx.deps.log.join(',')}`) }),
        ],
        runs: createMemoryPipelineRunStore(),
      },
    )

    await pipeline.invoke({}, args(log))

    const join = log.find(entry => entry.startsWith('join:'))!
    expect(join).toContain('left')
    expect(join).toContain('deeper')
  })

  test('a `skipWhen` that answers true makes the step a no-op but still completes it', async () => {
    const log: string[] = []
    const pipeline = makePipeline<State, Deps>(spec([{ step: 'a' }, { step: 'b', after: ['a'] }]), {
      steps: [step('a', undefined, () => true), step('b')],
      runs: createMemoryPipelineRunStore(),
    })

    const result = await pipeline.invoke({}, args(log))

    expect(log).toEqual(['b'])
    expect(result.completed).toEqual(['a', 'b'])
    expect(result.status).toBe(PipelineRunStatus.Done)
  })

  test('an optional step that fails lands in warnings and its successors still run', async () => {
    const log: string[] = []
    const pipeline = makePipeline<State, Deps>(
      spec([{ step: 'a', optional: true }, { step: 'b', after: ['a'] }]),
      {
        steps: [
          step('a', async () => { throw new Error('scaffold could not draw') }),
          step('b'),
        ],
        runs: createMemoryPipelineRunStore(),
      },
    )

    const result = await pipeline.invoke({}, args(log))

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(result.warnings).toEqual(['a: scaffold could not draw'])
    expect(log).toEqual(['b'])
  })

  test('a required step that fails stops the run and REPORTS it rather than throwing', async () => {
    // Every caller of a pipeline here has to write a status, a warning or a slot error before it
    // decides anything. A runner that threw would put that in a catch, where it gets forgotten.
    const log: string[] = []
    const pipeline = makePipeline<State, Deps>(
      spec([{ step: 'a' }, { step: 'b', after: ['a'] }, { step: 'c', after: ['b'] }]),
      {
        steps: [
          step('a'),
          step('b', async () => { throw new Error('the model refused') }),
          step('c'),
        ],
        runs: createMemoryPipelineRunStore(),
      },
    )

    const result = await pipeline.invoke({}, args(log))

    expect(result.status).toBe(PipelineRunStatus.Failed)
    expect(result.failedAt).toBe('b')
    expect(result.error?.message).toBe('the model refused')
    expect(result.pending).toEqual(['b', 'c'])
    expect(log).toEqual(['a'])
  })

  test('a fatal error is written to the row FIRST and then rethrown', async () => {
    // An exhausted balance must not become a result the caller reads and carries on from.
    class OutOfTokens extends Error {}
    const runs = createMemoryPipelineRunStore()
    const pipeline = makePipeline<State, Deps>(spec([{ step: 'a' }, { step: 'b', after: ['a'] }]), {
      steps: [step('a'), step('b', async () => { throw new OutOfTokens('no balance') })],
      runs,
      fatal: e => e instanceof OutOfTokens,
    })

    await expect(pipeline.invoke({}, args())).rejects.toThrow('no balance')

    const row = await runs.load('run-1')
    expect(row?.status).toBe(PipelineRunStatus.Failed)
    expect(row?.failedAt).toBe('b')
  })

  test('refuses a state larger than the cap by FAILING the step, never truncating it', async () => {
    const pipeline = makePipeline<State, Deps>(spec([{ step: 'a' }]), {
      steps: [step('a', async () => ({ blob: 'x'.repeat(1_000) }))],
      runs: createMemoryPipelineRunStore(),
      maxStateChars: 200,
    })

    const result = await pipeline.invoke({}, args())

    expect(result.status).toBe(PipelineRunStatus.Failed)
    expect(result.error?.message).toContain('pipeline-state')
  })

  test('records the row at every step boundary, before the step returns', async () => {
    const runs = createMemoryPipelineRunStore()
    const seenDuringB: string[] = []
    const pipeline = makePipeline<State, Deps>(spec([{ step: 'a' }, { step: 'b', after: ['a'] }]), {
      steps: [
        step('a', async () => ({ value: 7 })),
        step('b', async (_state, ctx) => {
          const row = await runs.load(ctx.runId)
          seenDuringB.push(...(row?.completed ?? []))
          seenDuringB.push(row?.state ?? '')
        }),
      ],
      runs,
    })

    await pipeline.invoke({}, args())

    expect(seenDuringB[0]).toBe('a')
    expect(seenDuringB[1]).toContain('"value":7')
  })

  test('`mark` persists a cursor mid-step, which is what makes a loop resumable', async () => {
    const runs = createMemoryPipelineRunStore()
    const pipeline = makePipeline<State, Deps>(spec([{ step: 'a' }]), {
      steps: [step('a', async (_state, ctx) => {
        await ctx.mark({ seen: ['one'] })
        const row = await runs.load(ctx.runId)
        expect(row?.state).toContain('one')
        throw new Error('died halfway')
      })],
      runs,
    })

    const result = await pipeline.invoke({}, args())

    expect(result.status).toBe(PipelineRunStatus.Failed)
    expect((await runs.load('run-1'))?.state).toContain('one')
  })

  test('an expired budget ends the run Aborted with pending naming what is left', async () => {
    const pipeline = makePipeline<State, Deps>(
      spec([{ step: 'a' }, { step: 'b', after: ['a'] }, { step: 'c', after: ['b'] }]),
      {
        steps: [
          step('a', async () => { await new Promise(resolve => setTimeout(resolve, 20)) }),
          step('b'),
          step('c'),
        ],
        runs: createMemoryPipelineRunStore(),
      },
    )

    const result = await pipeline.invoke({}, { ...args(), budgetMs: 10 })

    expect(result.status).toBe(PipelineRunStatus.Aborted)
    expect(result.completed).toEqual(['a'])
    expect(result.pending).toEqual(['b', 'c'])
  })

  test('reports progress for every step, including the ones it skipped', async () => {
    const seen: Array<{ step: string, skipped?: boolean }> = []
    const pipeline = makePipeline<State, Deps>(spec([{ step: 'a' }, { step: 'b', after: ['a'] }]), {
      steps: [step('a', undefined, () => true), step('b')],
      runs: createMemoryPipelineRunStore(),
      onProgress: progress => { seen.push({ step: progress.step, skipped: progress.skipped }) },
    })

    await pipeline.invoke({}, args())

    expect(seen).toEqual([{ step: 'a', skipped: true }, { step: 'b', skipped: undefined }])
  })

  test('carries a non-serializable dependency through without ever storing it', async () => {
    const runs = createMemoryPipelineRunStore()
    const cyclic: Record<string, unknown> = { name: 'file-helper' }
    cyclic.self = cyclic

    const pipeline = makePipeline<State, { helper: unknown }>(spec([{ step: 'a' }]), {
      steps: [{
        step: 'a',
        run: async (_state, ctx) => {
          expect((ctx.deps.helper as Record<string, unknown>).self).toBe(ctx.deps.helper)

          return { value: 1 }
        },
      }],
      runs,
    })

    const result = await pipeline.invoke(
      {}, { runId: 'run-1', deps: { helper: cyclic }, scope: 'project-1' },
    )

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect((await runs.load('run-1'))?.state).toBe('{"value":1}')
  })
})

describe('agent — cooperative stop', () => {
  test('a stop ends the run at the next step boundary: the running step commits, no new one starts', async () => {
    const runs = createMemoryPipelineRunStore()
    const stop = new AbortController()
    const log: string[] = []
    const pipeline = makePipeline<State, Deps>(
      spec([{ step: 'a' }, { step: 'b', after: ['a'] }, { step: 'c', after: ['b'] }]),
      {
        steps: [
          step('a'),
          step('b', async (_state, ctx) => { stop.abort(); ctx.deps.log.push('b'); return { value: 2 } }),
          step('c'),
        ],
        runs,
      },
    )

    const result = await pipeline.invoke({}, { ...args(log), stop: stop.signal })

    expect(result.status).toBe(PipelineRunStatus.Aborted)
    expect(result.stopped).toBe('stop')
    expect(result.completed).toEqual(['a', 'b'])
    expect(result.pending).toEqual(['c'])
    expect(result.state.value).toBe(2)
    expect(log).toEqual(['a', 'b'])
    const row = await runs.load('run-1')
    expect(row?.status).toBe(PipelineRunStatus.Aborted)
    expect(row?.note).toBe('stopped: stop')
  })

  test('a step sees the stop as ctx.stop; a run given none has no such key', async () => {
    const stop = new AbortController()
    const seen: Array<AbortSignal | undefined | 'absent'> = []
    const pipeline = makePipeline<State, Deps>(spec([{ step: 'a' }]), {
      steps: [step('a', async (_state, ctx) => { seen.push('stop' in ctx ? ctx.stop : 'absent') })],
    })

    await pipeline.invoke({}, { ...args(), stop: stop.signal })
    await pipeline.invoke({}, args())

    expect(seen).toEqual([stop.signal, 'absent'])
  })

  test('a stop before a parallel branch starts runs neither side of it', async () => {
    const stop = new AbortController()
    const log: string[] = []
    const pipeline = makePipeline<State, Deps>(
      spec([
        { step: 'a' },
        { step: 'left', after: ['a'] },
        { step: 'right', after: ['a'] },
        { step: 'join', after: ['left', 'right'] },
      ]),
      {
        steps: [
          step('a', async (_state, ctx) => { ctx.deps.log.push('a'); stop.abort() }),
          step('left'),
          step('right'),
          step('join'),
        ],
        runs: createMemoryPipelineRunStore(),
      },
    )

    const result = await pipeline.invoke({}, { ...args(log), stop: stop.signal })

    expect(result.status).toBe(PipelineRunStatus.Aborted)
    expect(result.stopped).toBe('stop')
    expect(log).toEqual(['a'])
    expect(result.completed).toEqual(['a'])
    expect([...result.pending].sort()).toEqual(['join', 'left', 'right'])
  })

  test('a boundary passed without the post-commit check still starts nothing after a stop', async () => {
    // An optional step that fails commits its warning and returns; the stop is met at the entry of
    // the next step, and the run ends `Aborted` once the graph drains.
    const runs = createMemoryPipelineRunStore()
    const stop = new AbortController()
    const log: string[] = []
    const pipeline = makePipeline<State, Deps>(
      spec([{ step: 'a', optional: true }, { step: 'b', after: ['a'] }]),
      {
        steps: [
          step('a', async () => { stop.abort(); throw new Error('could not draw') }),
          step('b'),
        ],
        runs,
      },
    )

    const result = await pipeline.invoke({}, { ...args(log), stop: stop.signal })

    expect(result.status).toBe(PipelineRunStatus.Aborted)
    expect(result.stopped).toBe('stop')
    expect(result.warnings).toEqual(['a: could not draw'])
    expect(log).toEqual([])
    expect((await runs.load('run-1'))?.note).toBe('stopped: stop')
  })

  test('a stop already aborted starts nothing at all', async () => {
    const stop = new AbortController()
    stop.abort()
    const log: string[] = []
    const pipeline = makePipeline<State, Deps>(spec([{ step: 'a' }, { step: 'b', after: ['a'] }]), {
      steps: [step('a'), step('b')],
      runs: createMemoryPipelineRunStore(),
    })

    const result = await pipeline.invoke({}, { ...args(log), stop: stop.signal })

    expect(result.status).toBe(PipelineRunStatus.Aborted)
    expect(result.stopped).toBe('stop')
    expect(result.completed).toEqual([])
    expect(log).toEqual([])
  })

  test('an expired budget names its reason on the result', async () => {
    const pipeline = makePipeline<State, Deps>(spec([{ step: 'a' }, { step: 'b', after: ['a'] }]), {
      steps: [step('a', async () => { await new Promise(resolve => setTimeout(resolve, 20)) }), step('b')],
      runs: createMemoryPipelineRunStore(),
    })

    const result = await pipeline.invoke({}, { ...args(), budgetMs: 5 })

    expect(result.stopped).toBe('budget')
  })
})
