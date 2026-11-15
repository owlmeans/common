import { describe, expect, test } from 'bun:test'
import { PipelineRunStatus } from '@owlmeans/agent-common'
import type { PipelineSpec } from '@owlmeans/agent-common'
import { createMemoryPipelineRunStore, makePipeline } from '../src/index.js'
import type { PipelineRunStore, PipelineStep } from '../src/index.js'

/**
 * The run row is written one save at a time.
 *
 * Steps with no dependency between them settle together. A store whose save is an upsert keyed by
 * the run id (the Mongo store) cannot take two first saves of a row at once: both insert, and the
 * unique index fails one — which failed whole initializations at their first step boundary. The
 * store below refuses any save that starts while another is in flight, so an overlap fails the run.
 */

interface State extends Record<string, unknown> { marks?: string[] }

const parallel: PipelineSpec = {
  alias: 'parallel-roots',
  version: 1,
  steps: [
    { step: 'ensure' },
    { step: 'refresh' },
    { step: 'entities' },
    { step: 'join', after: ['ensure', 'refresh', 'entities'] },
  ],
}

/** The memory store behind a save that takes a while and refuses to overlap another. */
const exclusiveStore = (): { runs: PipelineRunStore, overlaps: number, saves: number } => {
  const inner = createMemoryPipelineRunStore()
  const stats = { overlaps: 0, saves: 0 }
  let inFlight = 0
  const runs: PipelineRunStore = {
    ...inner,
    save: async row => {
      if (inFlight > 0) {
        stats.overlaps++
        throw new Error(`E11000 duplicate key: runId ${row.runId}`)
      }
      inFlight++
      try {
        await new Promise(resolve => setTimeout(resolve, 15))
        stats.saves++
        await inner.save(row)
      } finally {
        inFlight--
      }
    },
  }

  return { runs, get overlaps() { return stats.overlaps }, get saves() { return stats.saves } }
}

describe('agent — pipeline row saves', () => {
  test('parallel steps that settle together (skipped or run) never save the row at the same time', async () => {
    const store = exclusiveStore()
    const steps: PipelineStep<State, Record<string, never>>[] = [
      // Two skips settle in the same tick, the case that collided live.
      { step: 'ensure', skipWhen: async () => true, run: async () => ({}) },
      { step: 'refresh', skipWhen: async () => true, run: async () => ({}) },
      { step: 'entities', run: async state => ({ marks: [...(state.marks ?? []), 'entities'] }) },
      { step: 'join', run: async state => ({ marks: [...(state.marks ?? []), 'join'] }) },
    ]

    const result = await makePipeline<State, Record<string, never>>(parallel, { steps, runs: store.runs })
      .invoke({}, { runId: 'parallel-1', deps: {}, scope: 's' })

    expect(store.overlaps).toBe(0)
    expect(result.status).toBe(PipelineRunStatus.Done)
    expect([...result.completed].sort()).toEqual(['ensure', 'entities', 'join', 'refresh'])
    // The last save wrote the final row: every step completed, nothing pending.
    const row = await store.runs.load('parallel-1')
    expect(row?.status).toBe(PipelineRunStatus.Done)
    expect(row?.pending).toEqual([])
    expect(store.saves).toBeGreaterThan(1)
  })
})
