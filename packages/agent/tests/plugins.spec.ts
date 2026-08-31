import { describe, expect, test } from 'bun:test'
import { ExecutionLevel } from '@owlmeans/llm-common'
import type { Execution, LlmModel, PromptService } from '@owlmeans/llm'
import { makePromptService } from '@owlmeans/llm'
import { AgentRunStatus } from '@owlmeans/agent-common'
import {
  createMemoryConversationStore, createMemoryEventStore, createMemoryGraphStore, makeAgentModel,
  memoryEvents, memoryEventsPlugin, memoryGraph, memoryGraphPlugin, summarizePlugin,
} from '../src/index.js'
import { scriptedModel } from './_tools/model.js'

let seq = 0
const execution = (): Execution => ({
  level: ExecutionLevel.Helper,
  purpose: { dedication: 'project:p1' },
  policy: { effort: 'standard' as never },
  prompt: { role: 'You are a test agent.' },
  models: (() => { throw new Error('unused') }) as never,
  prompts: () => makePromptService({}, `plugins-spec-${++seq}`) as PromptService,
} as unknown as Execution)

const answering = (answer: unknown): LlmModel =>
  ({ invoke: async () => answer, ask: async () => answer as string } as unknown as LlmModel)

describe('agent — the summarize plugin', () => {
  test('stores a two-part compaction when a run finishes', async () => {
    const store = createMemoryConversationStore()
    const scripted = scriptedModel([{ content: 'renamed it' }])
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {},
      plugins: [summarizePlugin({
        store, model: () => answering({ summary: 'renamed the header', advice: 'run the build' }),
      })],
    })

    await agent.invoke('rename the header')

    const [event] = await store.last({ conversationId: 'project:p1', scope: 'p1' }, 5)
    expect(event).toMatchObject({
      summary: 'renamed the header', advice: 'run the build', status: AgentRunStatus.Ok,
      prompt: 'rename the header',
    })
  })

  test('puts the last sessions and the newest advice back into the next run', async () => {
    const store = createMemoryConversationStore()
    for (const [summary, advice] of [['did A', 'then B'], ['did B', 'then C']]) {
      await store.append({
        conversationId: 'project:p1', scope: 'p1', summary, advice, status: AgentRunStatus.Ok,
      })
    }

    const scripted = scriptedModel([{ content: 'ok' }])
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {},
      plugins: [summarizePlugin({ store, model: () => answering({ summary: 's', advice: 'a' }) })],
    })

    await agent.invoke('carry on')

    const asked = JSON.stringify(scripted.asked()[0])
    expect(asked).toContain('did A')
    expect(asked).toContain('did B')
    // Only the NEWEST advice: two conflicting "do this next" instructions is worse than none.
    expect(asked).toContain('then C')
    expect(asked.split('then B').length - 1).toBe(0)
  })

  test('honours the window rather than replaying the whole conversation', async () => {
    const store = createMemoryConversationStore()
    for (const summary of ['one', 'two', 'three', 'four']) {
      await store.append({
        conversationId: 'project:p1', scope: 'p1', summary, status: AgentRunStatus.Ok,
      })
    }

    const scripted = scriptedModel([{ content: 'ok' }])
    await makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {},
      plugins: [summarizePlugin({ store, window: 2, model: () => answering({ summary: 's', advice: '' }) })],
    }).invoke('go')

    const asked = JSON.stringify(scripted.asked()[0])
    expect(asked).toContain('four')
    expect(asked).toContain('three')
    expect(asked).not.toContain('"one"')
  })

  test('contributes nothing on the very first run', async () => {
    const scripted = scriptedModel([{ content: 'ok' }])
    await makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {},
      plugins: [summarizePlugin({ store: createMemoryConversationStore() })],
    }).invoke('go')

    expect(JSON.stringify(scripted.asked()[0])).not.toContain('Earlier in this conversation')
  })

  test('is a no-op with no store bound', async () => {
    // An application that has not wired persistence still runs agents; it just has no memory.
    const scripted = scriptedModel([{ content: 'ok' }])
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {}, plugins: [summarizePlugin({})],
    })

    expect((await agent.invoke('go')).message.content).toBe('ok')
  })

  test('records a failed run so the next session does not repeat it verbatim', async () => {
    const store = createMemoryConversationStore()
    const scripted = scriptedModel([{ toolCalls: [{ name: 'missing', args: {} }] }])
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {}, maxTurns: 1,
      plugins: [summarizePlugin({ store })],
    })

    expect(agent.invoke('do the impossible')).rejects.toThrow()
    await new Promise(resolve => setTimeout(resolve, 50))

    const [event] = await store.last({ conversationId: 'project:p1', scope: 'p1' }, 5)
    expect(event?.status).toBe(AgentRunStatus.Failed)
  })
})

describe('agent — the subsystem memory graph', () => {
  test('merges into a node instead of replacing it', async () => {
    // Replacing would make every write a potential act of forgetting.
    const graph = memoryGraph(createMemoryGraphStore())
    await graph.write('p1', 'auth', 'uses OIDC')
    await graph.write('p1', 'auth', 'tokens live 1h')

    const [node] = await graph.read('p1', 'auth')
    expect(node.content).toContain('uses OIDC')
    expect(node.content).toContain('tokens live 1h')
  })

  test('compacts a node that outgrows its budget', async () => {
    const graph = memoryGraph(createMemoryGraphStore(), {
      maxNodeChars: 60,
      model: () => answering('the folded account'),
      run: {} as never,
    })
    await graph.write('p1', 'auth', 'A'.repeat(50))
    await graph.write('p1', 'auth', 'B'.repeat(50))

    const [node] = await graph.read('p1', 'auth')
    expect(node.content.length).toBeLessThanOrEqual(60)
    expect(node.content).toBe('the folded account')
  })

  test('accumulates links and never links a node to itself', async () => {
    const graph = memoryGraph(createMemoryGraphStore())
    await graph.write('p1', 'auth', 'x', ['db'])
    await graph.write('p1', 'auth', 'y', ['api', 'auth'])

    const [node] = await graph.read('p1', 'auth')
    expect(node.links.sort()).toEqual(['api', 'db'])
  })

  test('follows links to the requested depth and no further', async () => {
    const graph = memoryGraph(createMemoryGraphStore())
    await graph.write('p1', 'auth', 'a', ['db'])
    await graph.write('p1', 'db', 'b', ['storage'])
    await graph.write('p1', 'storage', 'c')

    expect((await graph.read('p1', 'auth', 0)).map(node => node.subsystem)).toEqual(['auth'])
    expect((await graph.read('p1', 'auth', 1)).map(node => node.subsystem)).toEqual(['auth', 'db'])
    expect((await graph.read('p1', 'auth', 2)).map(node => node.subsystem))
      .toEqual(['auth', 'db', 'storage'])
  })

  test('survives a cycle in the graph', async () => {
    const graph = memoryGraph(createMemoryGraphStore())
    await graph.write('p1', 'a', 'x', ['b'])
    await graph.write('p1', 'b', 'y', ['a'])

    expect((await graph.read('p1', 'a', 5)).map(node => node.subsystem)).toEqual(['a', 'b'])
  })

  test('injects the index but never the content of a node', async () => {
    // Bulk-injecting notes spends the context window on knowledge the run cannot tell apart from
    // what it needs; the agent pulls what it wants by name.
    const store = createMemoryGraphStore()
    await memoryGraph(store).write('p1', 'auth', 'a long private note', ['db'])

    const scripted = scriptedModel([{ content: 'ok' }])
    await makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {},
      plugins: [memoryGraphPlugin({ store })],
    }).invoke('go')

    const asked = JSON.stringify(scripted.asked()[0])
    expect(asked).toContain('auth')
    expect(asked).not.toContain('a long private note')
  })

  test('offers its tools to the agent', async () => {
    const store = createMemoryGraphStore()
    const scripted = scriptedModel([
      { toolCalls: [{ name: 'memory_write', args: { subsystem: 'auth', content: 'noted' } }] },
      { content: 'done' },
    ])

    await makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {},
      plugins: [memoryGraphPlugin({ store })],
    }).invoke('remember something')

    expect((await store.read('p1', 'auth'))?.content).toBe('noted')
  })
})

describe('agent — the event sequence memory', () => {
  test('keeps only the most recent entries', async () => {
    const events = memoryEvents(createMemoryEventStore(), { limit: 2 })
    for (const content of ['a', 'b', 'c']) {
      await events.append('p1', 'note', content)
    }

    expect((await events.read('p1', 10)).map(event => event.content)).toEqual(['c', 'b'])
  })

  test('caps a single entry — an event is a line, not a document', async () => {
    const events = memoryEvents(createMemoryEventStore(), { maxEventChars: 20 })
    await events.append('p1', 'note', 'x'.repeat(500))

    expect((await events.read('p1', 1))[0].content.length).toBeLessThanOrEqual(20)
  })

  test('injects the recent window into a run', async () => {
    const store = createMemoryEventStore()
    await memoryEvents(store).append('p1', 'deploy', 'shipped version 3')

    const scripted = scriptedModel([{ content: 'ok' }])
    await makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {},
      plugins: [memoryEventsPlugin({ store })],
    }).invoke('go')

    expect(JSON.stringify(scripted.asked()[0])).toContain('shipped version 3')
  })

  test('lets an agent append through its tool', async () => {
    const store = createMemoryEventStore()
    const scripted = scriptedModel([
      { toolCalls: [{ name: 'event_append', args: { kind: 'fix', content: 'patched the header' } }] },
      { content: 'done' },
    ])

    await makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {},
      plugins: [memoryEventsPlugin({ store })],
    }).invoke('fix it')

    expect((await store.read('p1', 5))[0].content).toBe('patched the header')
  })
})
