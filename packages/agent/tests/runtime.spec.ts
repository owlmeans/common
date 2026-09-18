import { describe, expect, test } from 'bun:test'
import { makeFlowModel } from '@owlmeans/flow'
import { AGENT_RUN_FLOW, AgentRunStep, AgentRunTransition, agentRunFlow } from '@owlmeans/agent-common'
import type { PipelineRun } from '@owlmeans/agent-common'
import { PipelineRunStatus } from '@owlmeans/agent-common'
import {
  createMemoryCheckpointStore, createMemoryConversationStore, createMemoryEventStore,
  createMemoryGraphStore, createMemoryPipelineRunStore, makeStaticFlowProvider,
} from '../src/index.js'

const run = (extra: Partial<PipelineRun> = {}): PipelineRun => ({
  runId: 'r1',
  pipeline: 'p',
  version: 1,
  scope: 'project-1',
  status: PipelineRunStatus.Running,
  completed: [],
  pending: [],
  state: '{}',
  stateChars: 2,
  warnings: [],
  attempts: 0,
  startedAt: '2026-01-01T00:00:00.000Z',
  heartbeatAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

describe('agent — the static flow provider', () => {
  test('serves a declared flow and restores a serialized run', async () => {
    const provider = makeStaticFlowProvider([agentRunFlow])
    const model = await makeFlowModel(agentRunFlow)
    model.transit(AgentRunTransition.Prepare, true)
    const token = model.transit(AgentRunTransition.Work, true)

    expect((await provider(AGENT_RUN_FLOW)).flow).toBe(AGENT_RUN_FLOW)
    expect((await makeFlowModel(token, provider)).step().step).toBe(AgentRunStep.Working)
  })

  test('throws on an unknown flow, which is what makes token recovery work', async () => {
    // `makeFlowModel` reads a string as a flow NAME first and only re-reads it as a serialized
    // token once the provider throws. Returning null here would break every restore.
    expect(makeStaticFlowProvider([])('nothing-declared')).rejects.toThrow()
  })
})

describe('agent — the in-memory pipeline run store', () => {
  test('upserts on runId and hands back a copy, never its own row', async () => {
    const store = createMemoryPipelineRunStore()
    await store.save(run({ completed: ['a'] }))

    const loaded = (await store.load('r1'))!
    loaded.completed.push('b')

    expect((await store.load('r1'))?.completed).toEqual(['a'])
  })

  test('finds by scope, pipeline and status', async () => {
    const store = createMemoryPipelineRunStore()
    await store.save(run({ runId: 'a', scope: 's1' }))
    await store.save(run({ runId: 'b', scope: 's2' }))
    await store.save(run({ runId: 'c', scope: 's1', status: PipelineRunStatus.Done }))

    expect((await store.find({ scope: 's1', status: PipelineRunStatus.Running })).map(r => r.runId))
      .toEqual(['a'])
  })

  test('staleness is judged on the heartbeat, never on the status', async () => {
    // A run whose process died is `Running` forever; only the heartbeat separates it from one that
    // is still working.
    const store = createMemoryPipelineRunStore()
    await store.save(run({ runId: 'fresh', heartbeatAt: '2026-01-02T00:00:00.000Z' }))
    await store.save(run({ runId: 'stale', heartbeatAt: '2026-01-01T00:00:00.000Z' }))

    expect((await store.find({ staleBefore: '2026-01-01T12:00:00.000Z' })).map(r => r.runId))
      .toEqual(['stale'])
  })
})

describe('agent — the in-memory checkpoint store', () => {
  const record = (extra: Record<string, unknown> = {}) => ({
    threadId: 't', ns: '', checkpointId: '001', type: 'json',
    checkpoint: 'Y2s=', metadata: 'bWQ=', createdAt: '2026-01-01T00:00:00.000Z', ...extra,
  })

  test('returns the newest checkpoint of a thread when none is named', async () => {
    const store = createMemoryCheckpointStore()
    await store.put(record({ checkpointId: '001' }))
    await store.put(record({ checkpointId: '002' }))

    expect((await store.one('t', ''))?.checkpointId).toBe('002')
    expect((await store.one('t', '', '001'))?.checkpointId).toBe('001')
  })

  test('a positive write index is first-wins and a negative one overwrites', async () => {
    // The sign IS the write rule: a task's own output must survive a retry, while an error or an
    // interrupt is the newest word on the subject.
    const store = createMemoryCheckpointStore()
    const base = { threadId: 't', ns: '', checkpointId: '001', taskId: 'k', type: 'json' }
    await store.putWrites([{ ...base, idx: 0, channel: 'out', value: 'Zmly' }])
    await store.putWrites([{ ...base, idx: 0, channel: 'out', value: 'c2Vjb25k' }])
    await store.putWrites([{ ...base, idx: -1, channel: '__error__', value: 'Zmly' }])
    await store.putWrites([{ ...base, idx: -1, channel: '__error__', value: 'c2Vjb25k' }])

    const writes = await store.writesFor('t', '', ['001'])

    expect(writes.find(w => w.idx === 0)?.value).toBe('Zmly')
    expect(writes.find(w => w.idx === -1)?.value).toBe('c2Vjb25k')
  })

  test('dropping a thread takes its writes with it', async () => {
    const store = createMemoryCheckpointStore()
    await store.put(record())
    await store.putWrites([{
      threadId: 't', ns: '', checkpointId: '001', taskId: 'k', idx: 0, channel: 'c',
      type: 'json', value: 'Zmly',
    }])

    await store.dropThread('t')

    expect(await store.one('t', '')).toBeNull()
    expect(await store.writesFor('t', '', ['001'])).toEqual([])
  })
})

describe('agent — in-memory stores', () => {
  test('a conversation allocates monotonic sequence numbers per thread', async () => {
    const store = createMemoryConversationStore()
    const base = { scope: 'p1', summary: 's', status: 'ok' as never }

    await store.append({ ...base, conversationId: 'a' })
    await store.append({ ...base, conversationId: 'b' })
    const third = await store.append({ ...base, conversationId: 'a' })

    expect(third.seq).toBe(2)
    expect((await store.last({ conversationId: 'b', scope: 'p1' }, 10))).toHaveLength(1)
  })

  test('a conversation reads back newest first', async () => {
    const store = createMemoryConversationStore()
    const ref = { conversationId: 'a', scope: 'p1' }
    for (const summary of ['first', 'second', 'third']) {
      await store.append({ conversationId: 'a', scope: 'p1', summary, status: 'ok' as never })
    }

    expect((await store.last(ref, 2)).map(event => event.summary)).toEqual(['third', 'second'])
  })

  test('a memory graph node is replaced in place rather than appended', async () => {
    const store = createMemoryGraphStore()
    await store.write({ scope: 'p1', subsystem: 'auth', content: 'old', links: [] })
    await store.write({ scope: 'p1', subsystem: 'auth', content: 'new', links: ['db'] })

    expect(await store.index('p1')).toHaveLength(1)
    expect((await store.read('p1', 'auth'))?.content).toBe('new')
  })

  test('the graph index carries names and links but not content', async () => {
    const store = createMemoryGraphStore()
    await store.write({ scope: 'p1', subsystem: 'auth', content: 'secret detail', links: ['db'] })

    const index = await store.index('p1')

    expect(index[0]).toEqual({ subsystem: 'auth', links: ['db'], updatedAt: expect.any(String) })
    expect(JSON.stringify(index)).not.toContain('secret detail')
  })

  test('event memory prunes its own scope only', async () => {
    // A shared cap would let a chatty subject evict a quiet one's whole history.
    const store = createMemoryEventStore()
    await store.append({ scope: 'quiet', kind: 'note', content: 'keep me' }, 2)
    for (const content of ['a', 'b', 'c', 'd']) {
      await store.append({ scope: 'busy', kind: 'note', content }, 2)
    }

    expect((await store.read('busy', 10)).map(event => event.content)).toEqual(['d', 'c'])
    expect(await store.read('quiet', 10)).toHaveLength(1)
  })
})
