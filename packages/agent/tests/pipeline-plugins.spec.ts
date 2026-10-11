import { describe, expect, test } from 'bun:test'
import { PipelineRunStatus } from '@owlmeans/agent-common'
import type { PipelineSpec } from '@owlmeans/agent-common'
import { createMemoryPipelineRunStore, makePipeline } from '../src/index.js'
import type {
  PipelinePlugin, PipelineRunStore, PipelineStep, StepResults,
} from '../src/index.js'

/**
 * The pipeline plugin seam: when each hook fires, what it is told, and the two containment rules —
 * a plugin that throws never fails the run, and a plugin error the pipeline calls fatal takes the
 * same road a fatal step error takes.
 */

interface State extends Record<string, unknown> { value?: number }
interface Deps { log: string[] }

const spec: PipelineSpec = {
  alias: 'seam',
  version: 1,
  steps: [
    { step: 'a' },
    { step: 'skipped', after: ['a'] },
    { step: 'soft', after: ['a'], optional: true },
    { step: 'z', after: ['skipped', 'soft'] },
  ],
}

const steps = (fail: string[] = []): PipelineStep<State, Deps>[] => [
  { step: 'a', run: async (_s, ctx) => { ctx.deps.log.push('run:a'); return { value: 1 } } },
  { step: 'skipped', skipWhen: () => true, run: async () => ({ value: 999 }) },
  { step: 'soft', run: async () => { throw new Error('soft refused') } },
  {
    step: 'z',
    run: async (state, ctx) => {
      ctx.deps.log.push('run:z')
      if (fail.includes('z')) throw new Error('z refused')
      return { value: (state.value ?? 0) + 1 }
    },
  },
]

/** Records every hook as one line, and checks the row at `afterStep` time. */
const recorder = (log: string[], runs: PipelineRunStore, patch: Partial<PipelinePlugin<State, Deps>> = {}) => ({
  alias: 'recorder',
  enter: event => { log.push(`enter:${event.mode}:${event.inherited.join(',')}`) },
  beforeStep: ({ step }) => { log.push(`before:${step}`) },
  afterStep: async ({ step, state, ctx }) => {
    const row = await runs.load(ctx.runId)
    // The patch is already merged, and the step is NOT yet durably complete.
    log.push(`after:${step}:value=${state.value}:committed=${row?.completed.includes(step) === true}`)
  },
  passStep: ({ step, reason, error }) => { log.push(`pass:${step}:${reason}${error != null ? `:${error.message}` : ''}`) },
  exit: ({ result }) => { log.push(`exit:${result.status}`) },
  ...patch,
}) as PipelinePlugin<State, Deps>

describe('agent — pipeline plugin hooks', () => {
  test('fire in order: enter, before/after around each run, pass for a skip and an optional failure, exit', async () => {
    const log: string[] = []
    const runs = createMemoryPipelineRunStore()
    const pipeline = makePipeline<State, Deps>(spec, { steps: steps(), runs, plugins: [recorder(log, runs)] })

    const result = await pipeline.invoke({}, { runId: 'r', deps: { log }, scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    // `skipped` and `soft` share a superstep; the guard's await lets `soft` start first.
    expect(log).toEqual([
      'enter:fresh:',
      'before:a', 'run:a', 'after:a:value=1:committed=false',
      'before:soft', 'pass:skipped:skipped', 'pass:soft:failed:soft refused',
      'before:z', 'run:z', 'after:z:value=2:committed=false',
      'exit:done',
    ])
  })

  test('enter says how the run came in, and which steps it inherits', async () => {
    const log: string[] = []
    const runs = createMemoryPipelineRunStore()
    const build = (fail: string[]) =>
      makePipeline<State, Deps>(spec, { steps: steps(fail), runs, plugins: [recorder(log, runs)] })

    await build(['z']).invoke({}, { runId: 'r', deps: { log: [] }, scope: 's' })
    await build([]).invoke({}, { runId: 'r', deps: { log: [] }, scope: 's' })
    await build(['z']).invoke({}, { runId: 'r2', deps: { log: [] }, scope: 's' })
    await build([]).resume('r2', { deps: { log: [] } })
    await build([]).invoke({}, { runId: 'r2', deps: { log: [] }, scope: 's', restart: true })

    expect(log.filter(line => line.startsWith('enter:'))).toEqual([
      'enter:fresh:',
      'enter:continue:a,skipped,soft',
      'enter:fresh:',
      'enter:continue:a,skipped,soft',
      'enter:restart:',
    ])
  })

  test('are seated by alias and run by order', async () => {
    const log: string[] = []
    const named = (alias: string, order: number, tag: string): PipelinePlugin<State, Deps> =>
      ({ alias, order, enter: () => { log.push(tag) } })
    const pipeline = makePipeline<State, Deps>(
      { alias: 'order', version: 1, steps: [{ step: 'a' }] },
      {
        steps: [{ step: 'a', run: async () => undefined }],
        plugins: [named('late', 90, 'late'), named('early', 10, 'first-early'), named('early', 10, 'early')],
      },
    )

    await pipeline.invoke({}, { runId: 'r', deps: { log: [] }, scope: 's' })

    expect(log).toEqual(['early', 'late'])
  })

  test('the first plugin that offers results owns ctx.results', async () => {
    const seen: Array<string | undefined> = []
    const offer = (alias: string, ledger: string): PipelinePlugin<State, Deps> => ({
      alias, beforeStep: () => ({ results: { ledger } as StepResults }),
    })
    const pipeline = makePipeline<State, Deps>(
      { alias: 'offer', version: 1, steps: [{ step: 'a' }] },
      {
        steps: [{ step: 'a', run: async (_s, ctx) => { seen.push(ctx.results?.ledger) } }],
        plugins: [offer('one', 'first'), offer('two', 'second')],
      },
    )

    await pipeline.invoke({}, { runId: 'r', deps: { log: [] }, scope: 's' })

    expect(seen).toEqual(['first'])
  })

  test('a composed run is told which step of which run it runs under', async () => {
    const parents: unknown[] = []
    const child = makePipeline<State, Deps>(
      { alias: 'child', version: 1, steps: [{ step: 'c' }] },
      {
        steps: [{ step: 'c', run: async () => ({ value: 5 }) }],
        plugins: [{ alias: 'watch', enter: event => { parents.push(event.parent) } }],
      },
    )
    const parent = makePipeline<State, Deps>(
      { alias: 'parent', version: 1, steps: [{ step: 'nested' }] },
      { steps: [child.asStep<State>('nested', { input: () => ({}), output: out => ({ value: out.value }) })] },
    )

    await parent.invoke({}, { runId: 'p', deps: { log: [] }, scope: 's' })

    expect(parents).toEqual([{ pipeline: 'parent', runId: 'p', step: 'nested' }])
  })
})

describe('agent — pipeline plugin containment', () => {
  test('a plugin that throws on every hook costs nothing but a warning', async () => {
    const log: string[] = []
    const boom = () => { throw new Error('plugin down') }
    const pipeline = makePipeline<State, Deps>(spec, {
      steps: steps(),
      runs: createMemoryPipelineRunStore(),
      plugins: [{ alias: 'broken', enter: boom, beforeStep: boom, afterStep: boom, passStep: boom, exit: boom }],
    })

    const result = await pipeline.invoke({}, { runId: 'r', deps: { log }, scope: 's' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(result.state.value).toBe(2)
    expect(log).toEqual(['run:a', 'run:z'])
  })

  class OutOfTokens extends Error {}
  const fatal = (e: unknown): boolean => e instanceof OutOfTokens

  for (const hook of ['enter', 'afterStep', 'passStep', 'exit'] as const) {
    test(`a fatal error on ${hook} writes the row Failed first, then escapes`, async () => {
      const runs = createMemoryPipelineRunStore()
      const pipeline = makePipeline<State, Deps>(spec, {
        steps: steps(),
        runs,
        fatal,
        plugins: [{ alias: 'fatal', [hook]: () => { throw new OutOfTokens(`spent on ${hook}`) } }],
      })

      await expect(pipeline.invoke({}, { runId: 'r', deps: { log: [] }, scope: 's' }))
        .rejects.toThrow(`spent on ${hook}`)

      const row = await runs.load('r')
      expect(row?.status).toBe(PipelineRunStatus.Failed)
      expect(row?.error).toBe(`spent on ${hook}`)
      // Both passing steps share a superstep and both hit the fatal plugin; either may be named.
      const expected = { enter: ['a'], afterStep: ['a'], passStep: ['skipped', 'soft'], exit: ['z'] }[hook]
      expect(expected).toContain(row?.failedAt ?? '')
    })
  }
})
