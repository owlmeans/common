import { describe, expect, test } from 'bun:test'
import { AIMessage } from '@langchain/core/messages'
import { emptyCheckpoint } from '@langchain/langgraph'
import type { Checkpoint, CheckpointMetadata } from '@langchain/langgraph-checkpoint'
import { PipelineRunStatus } from '@owlmeans/agent-common'
import type { PipelineSpec } from '@owlmeans/agent-common'
import {
  createMemoryCheckpointStore, createMemoryPipelineRunStore, makeCheckpointSaver, makePipeline,
} from '../src/index.js'

/**
 * The saver is a protocol adapter over a storage port, so what is worth pinning is the protocol:
 * that a checkpoint survives the round trip as the OBJECTS it held, that the two write rules are
 * the right way round, and that a pipeline given one still behaves exactly as a pipeline without.
 */

const config = (thread: string, id?: string, ns = ''): { configurable: Record<string, unknown> } =>
  ({ configurable: { thread_id: thread, checkpoint_ns: ns, ...(id != null ? { checkpoint_id: id } : {}) } })

const checkpointWith = (id: string, values: Record<string, unknown>): Checkpoint => ({
  ...emptyCheckpoint(),
  id,
  channel_values: values,
})

const metadata = (): CheckpointMetadata =>
  ({ source: 'update', step: 1, parents: {} } as unknown as CheckpointMetadata)

describe('agent — the checkpoint saver', () => {
  test('round-trips a checkpoint, keeping class instances as instances', async () => {
    // The reason payloads go through the serde and never `JSON.stringify`: a plain-object round
    // trip returns something no `instanceof` in a provider adapter recognises again, and a resumed
    // run silently drops its tool calls.
    const saver = makeCheckpointSaver(createMemoryCheckpointStore())
    await saver.put(
      config('t'),
      checkpointWith('001', { messages: [new AIMessage({ content: 'hello' })] }),
      metadata(),
      {},
    )

    const tuple = await saver.getTuple(config('t'))
    const messages = tuple?.checkpoint.channel_values.messages as AIMessage[]

    expect(tuple?.checkpoint.id).toBe('001')
    expect(messages[0]).toBeInstanceOf(AIMessage)
    expect(messages[0].content).toBe('hello')
  })

  test('answers the newest checkpoint of a thread, and a named one exactly', async () => {
    const saver = makeCheckpointSaver(createMemoryCheckpointStore())
    await saver.put(config('t'), checkpointWith('001', { n: 1 }), metadata(), {})
    await saver.put(config('t', '001'), checkpointWith('002', { n: 2 }), metadata(), {})

    expect((await saver.getTuple(config('t')))?.checkpoint.id).toBe('002')
    expect((await saver.getTuple(config('t', '001')))?.checkpoint.id).toBe('001')
  })

  test('records the parent so a history walk has a chain to follow', async () => {
    const saver = makeCheckpointSaver(createMemoryCheckpointStore())
    await saver.put(config('t'), checkpointWith('001', {}), metadata(), {})
    await saver.put(config('t', '001'), checkpointWith('002', {}), metadata(), {})

    const tuple = await saver.getTuple(config('t', '002'))

    expect(tuple?.parentConfig?.configurable?.checkpoint_id).toBe('001')
  })

  test('a task write is first-wins and a control write overwrites', async () => {
    const saver = makeCheckpointSaver(createMemoryCheckpointStore())
    await saver.put(config('t'), checkpointWith('001', {}), metadata(), {})

    await saver.putWrites(config('t', '001'), [['out', 'first']], 'task-1')
    await saver.putWrites(config('t', '001'), [['out', 'second']], 'task-1')
    await saver.putWrites(config('t', '001'), [['__error__', 'first']], 'task-1')
    await saver.putWrites(config('t', '001'), [['__error__', 'second']], 'task-1')

    const writes = (await saver.getTuple(config('t', '001')))?.pendingWrites ?? []
    const byChannel = new Map(writes.map(([, channel, value]) => [channel, value]))

    expect(byChannel.get('out')).toBe('first')
    expect(byChannel.get('__error__')).toBe('second')
  })

  test('lists newest first and honours the limit at the STORE, not after decoding', async () => {
    const store = createMemoryCheckpointStore()
    const saver = makeCheckpointSaver(store)
    for (const id of ['001', '002', '003']) {
      await saver.put(config('t'), checkpointWith(id, {}), metadata(), {})
    }

    const seen: string[] = []
    for await (const tuple of saver.list(config('t'), { limit: 2 })) {
      seen.push(tuple.checkpoint.id)
    }

    expect(seen).toEqual(['003', '002'])
  })

  test('deleting a thread takes its checkpoints and its writes with it', async () => {
    const saver = makeCheckpointSaver(createMemoryCheckpointStore())
    await saver.put(config('t'), checkpointWith('001', {}), metadata(), {})
    await saver.putWrites(config('t', '001'), [['out', 1]], 'task-1')

    await saver.deleteThread('t')

    expect(await saver.getTuple(config('t'))).toBeUndefined()
  })

  test('answers nothing for a config with no thread rather than inventing one', async () => {
    const saver = makeCheckpointSaver(createMemoryCheckpointStore())

    expect(await saver.getTuple({ configurable: {} })).toBeUndefined()
  })
})

describe('agent — a checkpointed pipeline', () => {
  const spec: PipelineSpec = {
    alias: 'checkpointed', version: 1, steps: [{ step: 'a' }, { step: 'b', after: ['a'] }],
  }

  test('runs and resumes exactly as it does without one — the checkpointer is not the authority', async () => {
    const runs = createMemoryPipelineRunStore()
    const checkpointer = makeCheckpointSaver(createMemoryCheckpointStore())
    const calls: string[] = []
    const build = (fail?: string) => makePipeline<Record<string, unknown>, unknown>(spec, {
      runs,
      checkpointer,
      steps: spec.steps.map(declared => ({
        step: declared.step,
        run: async () => {
          calls.push(declared.step)
          if (fail === declared.step) throw new Error('refused')
        },
      })),
    })

    const failed = await build('b').invoke({}, { runId: 'r', deps: null, scope: 's' })
    expect(failed.status).toBe(PipelineRunStatus.Failed)

    calls.length = 0
    const resumed = await build().resume('r', { deps: null })

    expect(resumed.status).toBe(PipelineRunStatus.Done)
    expect(calls).toEqual(['b'])
  })

  test('leaves checkpoints behind for the thread it ran under', async () => {
    const store = createMemoryCheckpointStore()
    await makePipeline<Record<string, unknown>, unknown>(spec, {
      runs: createMemoryPipelineRunStore(),
      checkpointer: makeCheckpointSaver(store),
      steps: spec.steps.map(declared => ({ step: declared.step, run: async () => ({}) })),
    }).invoke({}, { runId: 'r', deps: null, scope: 's' })

    expect(await store.one('checkpointed:r', '')).not.toBeNull()
  })
})
