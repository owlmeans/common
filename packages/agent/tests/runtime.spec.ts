import { describe, expect, test } from 'bun:test'
import { makeFlowModel } from '@owlmeans/flow'
import { ExecutionLevel } from '@owlmeans/llm-common'
import type { ExecutionState } from '@owlmeans/llm-common'
import type { Execution } from '@owlmeans/llm'
import { AGENT_RUN_FLOW, AgentRunStep, AgentRunTransition, agentRunFlow } from '@owlmeans/agent-common'
import {
  createMemoryConversationStore, createMemoryEventStore, createMemoryGraphStore,
  createMemoryRunStateStore, inProcessTransport, makeAgentExecutionPlugin, makeStaticFlowProvider,
} from '../src/index.js'

const state = (extra: Record<string, unknown> = {}): ExecutionState => ({
  level: ExecutionLevel.Project,
  purpose: { dedication: 'project:p1' },
  policy: { effort: 'standard' as never },
  ...extra,
} as ExecutionState)

const exec = (): Execution => ({ ...state(), models: (() => {}) as never } as unknown as Execution)

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

describe('agent — the execution checkpoint plugin', () => {
  test('persists a checkpointed state and restores it by key', async () => {
    const store = createMemoryRunStateStore()
    const plugin = makeAgentExecutionPlugin({ store })

    await plugin.onCheckpoint!(state({ phase: 'develop' }), exec(), 'run-1')

    expect(await plugin.onRestore!('run-1')).toMatchObject({ phase: 'develop' })
  })

  test('recovers the conversation from the execution dedication', async () => {
    const store = createMemoryRunStateStore()
    await makeAgentExecutionPlugin({ store }).onCheckpoint!(state(), exec(), 'run-2')

    expect((await store.load('run-2'))?.conversationId).toBe('project:p1')
  })

  test('refuses a state too large to belong in a checkpoint', async () => {
    // A project execution carries the whole specification. Writing that on every checkpoint is a
    // storage problem that surfaces much later and much worse than a skipped write.
    const store = createMemoryRunStateStore()
    const plugin = makeAgentExecutionPlugin({ store, maxStateChars: 200 })

    await plugin.onCheckpoint!(state({ project: { specification: 'x'.repeat(5_000) } }), exec(), 'run-3')

    expect(await store.load('run-3')).toBeNull()
  })

  test('returns null for a key that was never checkpointed', async () => {
    const plugin = makeAgentExecutionPlugin({ store: createMemoryRunStateStore() })

    expect(await plugin.onRestore!('never-seen')).toBeNull()
  })

  test('announces a saved checkpoint on the transport by reference', async () => {
    // The message carries a reference, not the state: a queue whose messages hold a whole project
    // specification falls over on the first large project.
    const transport = inProcessTransport()
    const seen: unknown[] = []
    await transport.consume(async message => { seen.push(message) })

    await makeAgentExecutionPlugin({ store: createMemoryRunStateStore(), transport })
      .onCheckpoint!(state(), exec(), 'run-4')

    expect(seen).toEqual([{ id: 'run-4', conversationId: 'project:p1', flow: '', stateRef: 'run-4' }])
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
