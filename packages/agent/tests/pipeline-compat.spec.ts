import { describe, expect, test } from 'bun:test'
import { PipelineRunStatus } from '@owlmeans/agent-common'
import type { PipelineRun, PipelineSpec } from '@owlmeans/agent-common'
import { createMemoryPipelineRunStore, makePipeline } from '../src/index.js'
import type { PipelineRunContext, PipelineRunStore, PipelineStep } from '../src/index.js'

/**
 * A pipeline that declares no plugin behaves exactly as the runner did before plugins existed.
 *
 * The expected values below are GOLDEN: they were recorded from the runner as it stood before the
 * plugin seam was added, and every row the store is handed, every trace line and every progress
 * event must still match them byte for byte. Timestamps are the only thing normalised — they are
 * the one field that differs between two runs of the same code.
 */

interface State extends Record<string, unknown> {
  value?: number
  cursor?: string
  child?: number
}

interface Deps { log: string[] }

const normalise = (run: PipelineRun): string => JSON.stringify({
  ...run, startedAt: 'T', heartbeatAt: 'T', updatedAt: 'T',
})

const recording = (): { store: PipelineRunStore, saved: string[] } => {
  const inner = createMemoryPipelineRunStore()
  const saved: string[] = []

  return {
    saved,
    store: {
      load: inner.load,
      find: inner.find,
      save: async run => {
        saved.push(normalise(run))
        await inner.save(run)
      },
    },
  }
}

const childSpec: PipelineSpec = {
  alias: 'child', version: 1, steps: [{ step: 'c1' }, { step: 'c2', after: ['c1'] }],
}

const parentSpec: PipelineSpec = {
  alias: 'parent',
  version: 1,
  steps: [
    { step: 'a' },
    { step: 'left', after: ['a'] },
    { step: 'right', after: ['a'], optional: true },
    { step: 'skipped', after: ['left'] },
    { step: 'nested', after: ['left', 'right'] },
    { step: 'last', after: ['skipped', 'nested'] },
  ],
}

const build = (store: PipelineRunStore, keys: { withPluginsKey: boolean }) => {
  const contexts: PipelineRunContext<State, Deps>[] = []
  const child = makePipeline<State, Deps>(childSpec, {
    steps: [
      { step: 'c1', run: async state => ({ child: (state.child ?? 0) + 1 }) },
      { step: 'c2', run: async state => ({ child: (state.child ?? 0) + 10 }) },
    ],
    runs: store,
    ...(keys.withPluginsKey ? { plugins: [] } : {}),
  })
  const steps: PipelineStep<State, Deps>[] = [
    {
      step: 'a',
      run: async (_state, ctx) => {
        contexts.push(ctx)
        await ctx.mark({ cursor: 'half' })
        ctx.report('halfway')

        return { value: 1 }
      },
    },
    { step: 'left', run: async (state, ctx) => { ctx.deps.log.push('left'); return { value: (state.value ?? 0) + 1 } } },
    { step: 'right', run: async () => { throw new Error('right refused') } },
    { step: 'skipped', skipWhen: () => true, run: async () => ({ value: 999 }) },
    child.asStep<State>('nested', {
      input: parent => ({ child: parent.value }),
      output: result => ({ child: result.child }),
    }),
    { step: 'last', run: async (state, ctx) => { contexts.push(ctx); return { value: (state.value ?? 0) + 100 } } },
  ]
  const trace: string[] = []
  const progress: string[] = []
  const parent = makePipeline<State, Deps>(parentSpec, {
    steps,
    runs: store,
    trace: line => { trace.push(line) },
    onProgress: event => { progress.push(JSON.stringify(event)) },
    ...(keys.withPluginsKey ? { plugins: [] } : {}),
  })

  return { parent, trace, progress, contexts }
}

const GOLDEN_SAVED = [
  '{"runId":"r","pipeline":"parent","version":1,"scope":"s","status":"running","completed":[],"pending":["a","left","right","skipped","nested","last"],"state":"{\\"cursor\\":\\"half\\"}","stateChars":17,"warnings":[],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T"}',
  '{"runId":"r","pipeline":"parent","version":1,"scope":"s","status":"running","completed":["a"],"pending":["left","right","skipped","nested","last"],"state":"{\\"cursor\\":\\"half\\",\\"value\\":1}","stateChars":27,"warnings":[],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T","note":"halfway"}',
  '{"runId":"r","pipeline":"parent","version":1,"scope":"s","status":"running","completed":["a","left"],"pending":["right","skipped","nested","last"],"state":"{\\"cursor\\":\\"half\\",\\"value\\":2}","stateChars":27,"warnings":[],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T","note":"halfway"}',
  '{"runId":"r","pipeline":"parent","version":1,"scope":"s","status":"running","completed":["a","left","right"],"pending":["skipped","nested","last"],"state":"{\\"cursor\\":\\"half\\",\\"value\\":2}","stateChars":27,"warnings":["right: right refused"],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T","note":"halfway"}',
  '{"runId":"r","pipeline":"parent","version":1,"scope":"s","status":"running","completed":["a","left","right","skipped"],"pending":["nested","last"],"state":"{\\"cursor\\":\\"half\\",\\"value\\":2}","stateChars":27,"warnings":["right: right refused"],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T","note":"halfway"}',
  '{"runId":"r/nested","pipeline":"child","version":1,"scope":"s","status":"running","completed":["c1"],"pending":["c2"],"state":"{\\"child\\":3}","stateChars":11,"warnings":[],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T"}',
  '{"runId":"r/nested","pipeline":"child","version":1,"scope":"s","status":"running","completed":["c1","c2"],"pending":[],"state":"{\\"child\\":13}","stateChars":12,"warnings":[],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T"}',
  '{"runId":"r/nested","pipeline":"child","version":1,"scope":"s","status":"done","completed":["c1","c2"],"pending":[],"state":"{\\"child\\":13}","stateChars":12,"warnings":[],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T"}',
  '{"runId":"r","pipeline":"parent","version":1,"scope":"s","status":"running","completed":["a","left","right","skipped","nested"],"pending":["last"],"state":"{\\"cursor\\":\\"half\\",\\"value\\":2,\\"child\\":13}","stateChars":38,"warnings":["right: right refused"],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T","note":"halfway"}',
  '{"runId":"r","pipeline":"parent","version":1,"scope":"s","status":"running","completed":["a","left","right","skipped","nested","last"],"pending":[],"state":"{\\"cursor\\":\\"half\\",\\"value\\":102,\\"child\\":13}","stateChars":40,"warnings":["right: right refused"],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T","note":"halfway"}',
  '{"runId":"r","pipeline":"parent","version":1,"scope":"s","status":"done","completed":["a","left","right","skipped","nested","last"],"pending":[],"state":"{\\"cursor\\":\\"half\\",\\"value\\":102,\\"child\\":13}","stateChars":40,"warnings":["right: right refused"],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T","note":"halfway"}',
]

const GOLDEN_TRACE = [
  '[pipe:parent:r] start · steps=6 inherited=0 attempt=0',
  '[pipe:parent:r] step 1/6 a (run)',
  '[pipe:parent:r] row saved · completed=0/6 chars=17',
  '[pipe:parent:r] row saved · completed=1/6 chars=27',
  '[pipe:parent:r] step 2/6 left (run)',
  '[pipe:parent:r] step 3/6 right (run)',
  '[pipe:parent:r] row saved · completed=3/6 chars=27',
  '[pipe:parent:r] row saved · completed=3/6 chars=27',
  '[pipe:parent:r] step 5/6 nested (run)',
  '[pipe:parent:r] step 4/6 skipped (skip)',
  '[pipe:parent:r] row saved · completed=4/6 chars=27',
  '[pipe:parent:r] row saved · completed=5/6 chars=38',
  '[pipe:parent:r] step 6/6 last (run)',
  '[pipe:parent:r] row saved · completed=6/6 chars=40',
  '[pipe:parent:r] row saved · completed=6/6 chars=40',
]

const GOLDEN_PROGRESS = [
  '{"pipeline":"parent","runId":"r","step":"a","index":1,"total":6}',
  '{"pipeline":"parent","runId":"r","step":"a","index":1,"total":6,"note":"halfway"}',
  '{"pipeline":"parent","runId":"r","step":"left","index":2,"total":6}',
  '{"pipeline":"parent","runId":"r","step":"right","index":3,"total":6}',
  '{"pipeline":"parent","runId":"r","step":"nested","index":5,"total":6}',
  '{"pipeline":"parent","runId":"r","step":"skipped","index":4,"total":6,"skipped":true}',
  '{"pipeline":"parent","runId":"r","step":"last","index":6,"total":6}',
]

describe('agent — a pipeline without plugins is unchanged', () => {
  for (const withPluginsKey of [false, true]) {
    test(`rows, trace and progress match the pre-plugin runner (plugins key ${withPluginsKey ? 'empty' : 'absent'})`, async () => {
      const { store, saved } = recording()
      const { parent, trace, progress, contexts } = build(store, { withPluginsKey })
      const log: string[] = []

      const result = await parent.invoke({}, { runId: 'r', deps: { log }, scope: 's' })

      expect(result.status).toBe(PipelineRunStatus.Done)
      expect(result.state).toEqual({ cursor: 'half', value: 102, child: 13 })
      expect(result.warnings).toEqual(['right: right refused'])
      expect(saved).toEqual(GOLDEN_SAVED)
      expect(trace).toEqual(GOLDEN_TRACE)
      expect(progress).toEqual(GOLDEN_PROGRESS)
      // A step of a pipeline that never opted in has no results surface at all — not even the key.
      for (const ctx of contexts) {
        expect('results' in ctx).toBe(false)
        expect(Object.keys(ctx).sort()).toEqual([
          'ask', 'completed', 'deps', 'entityId', 'expired', 'mark', 'remainingMs', 'report', 'runId', 'scope',
          'signal', 'spec', 'step',
        ])
      }
    })
  }

  test('a fatal error still writes the row Failed first and then escapes', async () => {
    class OutOfTokens extends Error {}
    const { store, saved } = recording()
    const pipeline = makePipeline<State, Deps>(
      { alias: 'fatal', version: 1, steps: [{ step: 'a' }, { step: 'b', after: ['a'] }] },
      {
        steps: [
          { step: 'a', run: async () => ({ value: 1 }) },
          { step: 'b', run: async () => { throw new OutOfTokens('no balance') } },
        ],
        runs: store,
        fatal: e => e instanceof OutOfTokens,
      },
    )

    await expect(pipeline.invoke({}, { runId: 'f', deps: { log: [] }, scope: 's' }))
      .rejects.toThrow('no balance')
    expect(saved).toEqual([
      '{"runId":"f","pipeline":"fatal","version":1,"scope":"s","status":"running","completed":["a"],"pending":["b"],"state":"{\\"value\\":1}","stateChars":11,"warnings":[],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T"}',
      '{"runId":"f","pipeline":"fatal","version":1,"scope":"s","status":"failed","completed":["a"],"pending":["b"],"state":"{\\"value\\":1}","stateChars":11,"warnings":[],"attempts":0,"startedAt":"T","heartbeatAt":"T","updatedAt":"T","failedAt":"b","error":"no balance"}',
    ])
  })
})
