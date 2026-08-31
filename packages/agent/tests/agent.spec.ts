import { describe, expect, test } from 'bun:test'
import { tool } from '@langchain/core/tools'
import * as z from 'zod'
import { ExecutionLevel, PromptBlock } from '@owlmeans/llm-common'
import { makePromptService } from '@owlmeans/llm'
import type { Execution, PromptService } from '@owlmeans/llm'
import { AgentRunStatus } from '@owlmeans/agent-common'
import { makeAgentModel } from '../src/index.js'
import type { AgentPlugin, AgentToolSet } from '../src/index.js'
import { scriptedModel } from './_tools/model.js'

let seq = 0
const promptService = (): PromptService =>
  makePromptService({}, `agent-spec-prompts-${++seq}`)

const execution = (prompts?: () => PromptService): Execution => ({
  level: ExecutionLevel.Helper,
  purpose: { dedication: 'project:p1' },
  policy: { effort: 'standard' as never },
  prompt: { role: 'You are a test agent.' },
  models: (() => { throw new Error('unused') }) as never,
  ...(prompts != null ? { prompts } : {}),
} as unknown as Execution)

const echo = tool(
  async ({ value }: { value: string }) => `echoed:${value}`,
  { name: 'echo', description: 'Echoes its argument.', schema: z.object({ value: z.string() }) },
) as unknown as AgentToolSet[string]

describe('agent — the tool loop', () => {
  test('answers without tools when the model asks for none', async () => {
    const scripted = scriptedModel([{ content: 'done' }])
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {},
    })

    const result = await agent.invoke('do the thing')

    expect(result.message.content).toBe('done')
    expect(scripted.turns()).toBe(1)
  })

  test('runs a requested tool and asks again with its result', async () => {
    const scripted = scriptedModel([
      { toolCalls: [{ name: 'echo', args: { value: 'hi' } }] },
      { content: 'finished' },
    ])
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: { echo },
    })

    const result = await agent.invoke('use the tool')

    expect(result.message.content).toBe('finished')
    expect(scripted.turns()).toBe(2)
    // The tool's answer has to reach the second ask, or the loop is a no-op with extra steps.
    expect(JSON.stringify(scripted.asked()[1])).toContain('echoed:hi')
  })

  test('survives a tool that fails, feeding the error back to the model', async () => {
    const explodes = tool(
      async () => { throw new Error('nope') },
      { name: 'explodes', description: 'Throws.', schema: z.object({}) },
    ) as unknown as AgentToolSet[string]
    const scripted = scriptedModel([
      { toolCalls: [{ name: 'explodes', args: {} }] },
      { content: 'recovered' },
    ])
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: { explodes },
    })

    const result = await agent.invoke('break it')

    expect(result.message.content).toBe('recovered')
    expect(JSON.stringify(scripted.asked()[1])).toContain('nope')
  })

  test('stops at the turn ceiling instead of looping on a model that never answers', async () => {
    // A model that keeps calling tools forever is the ordinary failure of an unsatisfied loop.
    // Without a ceiling it spends the caller's budget until something else kills it.
    const scripted = scriptedModel([{ toolCalls: [{ name: 'echo', args: { value: 'again' } }] }])
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: { echo }, maxTurns: 3,
    })

    expect(agent.invoke('spin')).rejects.toThrow(/loop-exhausted/)
  })
})

describe('agent — plugins', () => {
  const collecting = (): { plugin: AgentPlugin, finished: unknown[] } => {
    const finished: unknown[] = []
    return {
      finished,
      plugin: {
        alias: 'collector',
        context: async () => ['REMEMBERED CONTEXT'],
        onFinish: async (_run, _result, outcome) => { finished.push(outcome) },
      },
    }
  }

  test('contributes context into the prompt and fires on finish', async () => {
    const scripted = scriptedModel([{ content: 'ok' }])
    const { plugin, finished } = collecting()
    const agent = makeAgentModel({
      exec: execution(promptService), agentModel: scripted.model, tools: {}, plugins: [plugin],
    })

    await agent.invoke('go')

    expect(JSON.stringify(scripted.asked()[0])).toContain('REMEMBERED CONTEXT')
    expect(finished).toHaveLength(1)
    expect((finished[0] as { status: string }).status).toBe(AgentRunStatus.Ok)
  })

  test('contributed context lands in the volatile block, never in the cached prefix', async () => {
    // The Context block is the only one a provider will not put a cache breakpoint on. Volatile
    // material anywhere above it invalidates the prefix every call that shares the persona pays for.
    const prompts = promptService()
    const composed = await prompts.compose(
      { role: 'You are a test agent.', context: ['REMEMBERED CONTEXT'] },
      [],
      { model: scriptedModel([]).model },
    )

    const context = composed.blocks.find(block => block.block === PromptBlock.Context)
    const role = composed.blocks.find(block => block.block === PromptBlock.Role)

    expect(context?.text).toContain('REMEMBERED CONTEXT')
    expect(role?.text).not.toContain('REMEMBERED CONTEXT')
  })

  test('a plugin that throws while contributing does not stop the run', async () => {
    const scripted = scriptedModel([{ content: 'ok' }])
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {},
      plugins: [{ alias: 'broken', context: async () => { throw new Error('no memory today') } }],
    })

    expect((await agent.invoke('go')).message.content).toBe('ok')
  })

  test('reports a failed run to its plugins before rethrowing', async () => {
    // A run that vanishes from the history is one the next session repeats verbatim.
    const scripted = scriptedModel([{ toolCalls: [{ name: 'echo', args: { value: 'x' } }] }])
    const { plugin, finished } = collecting()
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: { echo }, maxTurns: 1,
      plugins: [plugin],
    })

    expect(agent.invoke('spin')).rejects.toThrow()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect((finished[0] as { status: string })?.status).toBe(AgentRunStatus.Failed)
  })

  test('seats a re-registered plugin in place rather than emitting it twice', async () => {
    const scripted = scriptedModel([{ content: 'ok' }])
    const agent = makeAgentModel({ exec: execution(promptService), agentModel: scripted.model, tools: {} })

    agent.use({ alias: 'ctx', context: async () => ['ONCE'] })
    agent.use({ alias: 'ctx', context: async () => ['ONCE'] })

    await agent.invoke('go')

    const asked = JSON.stringify(scripted.asked()[0])
    expect(asked.split('ONCE').length - 1).toBe(1)
  })
})

describe('agent — finalization', () => {
  test('defers finalization when the caller owns the outcome', async () => {
    // Free flight validates and repairs AFTER the model stops talking; a compaction written before
    // that describes a state which did not survive it.
    const scripted = scriptedModel([{ content: 'ok' }])
    const finished: unknown[] = []
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {}, autoFinish: false,
      plugins: [{ alias: 'c', onFinish: async (_r, _res, outcome) => { finished.push(outcome) } }],
    })

    const result = await agent.invoke('go')
    expect(finished).toHaveLength(0)

    await result.run.finish({ status: AgentRunStatus.Ok, note: 'fixers clean' })
    expect((finished[0] as { note: string }).note).toBe('fixers clean')
  })

  test('a second finish is a no-op, never a second event', async () => {
    const scripted = scriptedModel([{ content: 'ok' }])
    const finished: unknown[] = []
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {}, autoFinish: false,
      plugins: [{ alias: 'c', onFinish: async () => { finished.push(1) } }],
    })

    const result = await agent.invoke('go')
    await result.run.finish({ status: AgentRunStatus.Ok })
    await result.run.finish({ status: AgentRunStatus.Ok })

    expect(finished).toHaveLength(1)
  })

  test('a failing plugin does not fail the run it is finalizing', async () => {
    const scripted = scriptedModel([{ content: 'ok' }])
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: {}, autoFinish: false,
      plugins: [{ alias: 'c', onFinish: async () => { throw new Error('store is down') } }],
    })

    const result = await agent.invoke('go')

    expect(result.run.finish({ status: AgentRunStatus.Ok })).resolves.toBeUndefined()
  })
})
