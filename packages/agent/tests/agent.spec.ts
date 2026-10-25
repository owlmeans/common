import { describe, expect, test } from 'bun:test'
import { tool } from '@langchain/core/tools'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import * as z from 'zod'
import { ExecutionLevel, ModelProvider, PromptBlock } from '@owlmeans/llm-common'
import { anthropicPlugin, makePromptService, openAiPlugin } from '@owlmeans/llm'
import type { Execution, ModelConfig, PromptService } from '@owlmeans/llm'
import { HumanMessage, ToolMessage } from '@langchain/core/messages'
import { AgentRunStatus } from '@owlmeans/agent-common'
import {
  AGENT_INBOX_PREFIX, AGENT_STOP_INSTRUCTION, AGENT_STOP_SUMMARY_TIMEOUT_MS, AGENT_STOPPED_NOTE,
  AGENT_STOPPED_TOOL_RESULT, makeAgentModel,
} from '../src/index.js'
import type { AgentInbox, AgentPlugin, AgentToolSet } from '../src/index.js'
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

  test('contributed context lands in the project message, never in the cached system', async () => {
    // The system region is what every run of the persona shares. Run-specific material anywhere in
    // it invalidates the prefix every call that shares the persona pays for.
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

  test('seats a plugin passed through options by alias, so a service plugin can be replaced', async () => {
    // The service composes its own plugins ahead of an agent's precisely so the agent's can
    // REPLACE one by alias. A constructor that spread the array made "replace" mean "run both",
    // and the failure — every context block emitted twice — is silent and expensive.
    const scripted = scriptedModel([{ content: 'done' }])
    const block = (text: string): AgentPlugin =>
      ({ alias: 'memory', context: async () => [text] })

    const agent = makeAgentModel({
      exec: execution(promptService),
      agentModel: scripted.model,
      tools: {},
      plugins: [block('the service version'), block('the agent version')],
    })

    await agent.invoke('go')

    // The project message, right after the system, carries what the plugins contributed.
    const project = String((scripted.asked()[0][1] as { content: unknown }).content)
    expect(project).toContain('the agent version')
    expect(project).not.toContain('the service version')
  })
})

describe('agent — the prompt on the wire', () => {
  const content = (message: unknown): unknown => (message as { content: unknown }).content
  const marks = (message: unknown, key: string): number => Array.isArray(content(message))
    ? (content(message) as Array<Record<string, unknown>>).filter(block => block[key] != null).length
    : 0
  const long = 'x'.repeat(400)
  const anthropicExec = (prompts: () => PromptService): Execution => ({
    ...execution(prompts), prompt: { role: `You are a test agent. ${long}`, skills: [] },
  } as unknown as Execution)

  // The system was stringified once — a JSON dump of content blocks sent as the persona.
  test('the system goes out as text blocks, the project message second, the tail on a copy of the opening', async () => {
    const scripted = scriptedModel([
      { toolCalls: [{ name: 'echo', args: { value: 'hi' } }] },
      { content: 'done' },
    ], { modelName: 'claude-haiku-4-5', metadata: { config: { model: 'claude-haiku-4-5', cacheMinTokens: 1 } } })
    const prompts = promptService()
    prompts.register({ alias: 'percall', body: 'per-call skill' })
    const agent = makeAgentModel({
      exec: anthropicExec(() => prompts), agentModel: scripted.model, tools: { echo }, provider: anthropicPlugin,
      context: ['RUN FACTS'],
    })

    const result = await agent.invoke('use the tool')

    const [first, second] = scripted.asked()
    expect(content(first![0])).toEqual([
      { type: 'text', text: `You are a test agent. ${long}`, cache_control: { type: 'ephemeral' } },
    ])
    expect(JSON.stringify(content(first![1]))).toContain('RUN FACTS')
    expect(marks(first![1], 'cache_control')).toBe(1)
    // Three explicit markers at most, never on the final message; the automatic one moves forward.
    for (const round of [first!, second!]) {
      const explicit = round.reduce<number>((sum, message) => sum + marks(message, 'cache_control'), 0)
      expect(explicit).toBeLessThanOrEqual(3)
      expect(marks(round[round.length - 1], 'cache_control')).toBe(0)
    }
    expect(scripted.options()[1]!.cache_control).toEqual({ type: 'ephemeral' })
    expect(second!.length).toBe(first!.length + 2)
    // The transcript keeps the opening as the caller sent it.
    expect(result.messages[0]!.content).toBe('use the tool')
  })

  test('the tail rides a copy of the opening, after the payload', async () => {
    const scripted = scriptedModel([{ content: 'ok' }])
    const prompts = makePromptService({}, `agent-spec-prompts-${++seq}`)
    prompts.use({ alias: 'late', compose: ctx => ctx.add(PromptBlock.Tail, 'LATE PACKAGE') })
    const agent = makeAgentModel({ exec: execution(() => prompts), agentModel: scripted.model, tools: {} })

    const result = await agent.invoke('go')

    const asked = scripted.asked()[0]!
    expect(content(asked[asked.length - 1])).toBe('go\n\nLATE PACKAGE')
    expect(result.messages[0]!.content).toBe('go')
  })

  // By instance alone every ChatOpenAI is the compatible plugin's, which caches nothing; the agent
  // resolves the provider the service built the model with.
  test('a service-built ChatOpenAI is cached through the OpenAI plugin', async () => {
    const scripted = scriptedModel([{ content: 'ok' }])
    const chat = openAiPlugin.build({
      alias: 'spec', secret: 'sk-test', callbacks: [],
      config: { alias: 'spec', provider: ModelProvider.OpenAI, model: 'gpt-6-sol', cacheMinTokens: 1 } as ModelConfig,
    })
    ;(chat as unknown as { bindTools: () => BaseChatModel }).bindTools = () => scripted.model
    const agent = makeAgentModel({
      exec: anthropicExec(promptService), agentModel: chat, tools: {}, context: ['RUN FACTS'],
    })

    await agent.invoke('go')

    expect(JSON.stringify(scripted.asked()[0])).toContain('prompt_cache_breakpoint')
    expect(scripted.options()[0]!.promptCacheOptions).toEqual({ mode: 'explicit' })
  })
})

describe('agent — stop and inbox', () => {
  const counting = (): { echo: AgentToolSet[string], runs: string[] } => {
    const runs: string[] = []
    return {
      runs,
      echo: tool(
        async ({ value }: { value: string }) => { runs.push(value); return `echoed:${value}` },
        { name: 'echo', description: 'Echoes its argument.', schema: z.object({ value: z.string() }) },
      ) as unknown as AgentToolSet[string],
    }
  }
  const contentOf = (message: unknown): string => String((message as { content: unknown }).content)
  const last = <T>(list: readonly T[]): T => list[list.length - 1]

  test('a stop during a tool round runs nothing more and ends on ONE summary that may choose no tool', async () => {
    const stop = new AbortController()
    const { echo, runs } = counting()
    const halt = tool(
      async () => { stop.abort(); return 'halted' },
      { name: 'halt', description: 'Presses stop.', schema: z.object({}) },
    ) as unknown as AgentToolSet[string]
    const scripted = scriptedModel([
      { toolCalls: [{ name: 'halt', args: {} }] },
      // A provider that ignored the tool choice: the call is still never run.
      { content: 'Changed A; B is left undone.', toolCalls: [{ name: 'echo', args: { value: 'never' } }] },
      { content: 'a third call must not happen' },
    ])
    const finished: Array<{ note?: string }> = []
    const agent = makeAgentModel({
      exec: execution(), agentModel: scripted.model, tools: { echo, halt },
      plugins: [{ alias: 'c', onFinish: async (_run, _result, outcome) => { finished.push(outcome) } }],
    })

    const result = await agent.invoke('work', { stop: stop.signal })

    expect(result.stopped).toBe(true)
    expect(scripted.turns()).toBe(2)
    expect(runs).toEqual([])
    expect(scripted.options()[0]!.tool_choice).toBeUndefined()
    expect(scripted.options()[1]!.tool_choice).toBe('none')
    expect(scripted.options()[1]!.timeout).toBe(AGENT_STOP_SUMMARY_TIMEOUT_MS)
    // The tools stay declared: a transcript carrying tool blocks needs them.
    expect(scripted.bound()[1]).toEqual(['echo', 'halt'])
    // The stop is never handed to a model call.
    expect(scripted.options().every(option => option.signal == null)).toBe(true)
    const summary = scripted.asked()[1]!
    expect(contentOf(last(summary))).toBe(AGENT_STOP_INSTRUCTION)
    expect(summary[summary.length - 2]).toBeInstanceOf(ToolMessage)
    expect(contentOf(summary[summary.length - 2])).toBe('halted')
    expect(result.message.content).toBe('Changed A; B is left undone.')
    expect(result.message.tool_calls ?? []).toEqual([])
    expect(finished[0]?.note).toBe(AGENT_STOPPED_NOTE)
  })

  test('the tool calls of an answer that arrives after the stop are answered, never run', async () => {
    const stop = new AbortController()
    const { echo, runs } = counting()
    const scripted = scriptedModel([
      {
        before: () => { stop.abort() },
        toolCalls: [{ name: 'echo', args: { value: 'a' } }, { name: 'echo', args: { value: 'b' } }],
      },
      { content: 'Nothing was changed.' },
    ])
    const agent = makeAgentModel({ exec: execution(), agentModel: scripted.model, tools: { echo } })

    const result = await agent.invoke('work', { stop: stop.signal })

    expect(runs).toEqual([])
    expect(result.stopped).toBe(true)
    expect(scripted.turns()).toBe(2)
    const answered = scripted.asked()[1]!.filter(message => message instanceof ToolMessage) as ToolMessage[]
    expect(answered.map(message => [message.content, message.status])).toEqual([
      [AGENT_STOPPED_TOOL_RESULT, 'error'], [AGENT_STOPPED_TOOL_RESULT, 'error'],
    ])
    expect(result.message.content).toBe('Nothing was changed.')
  })

  test('a stop that meets an answer without tool calls ends there, with no summary and no inbox close', async () => {
    const stop = new AbortController()
    let closes = 0
    const scripted = scriptedModel([{ before: () => { stop.abort() }, content: 'all done' }])
    const agent = makeAgentModel({ exec: execution(), agentModel: scripted.model, tools: {} })

    const result = await agent.invoke('work', {
      stop: stop.signal, inbox: { drain: async () => [], drainOrClose: async () => { closes++; return ['more'] } },
    })

    expect(result.stopped).toBe(true)
    expect(scripted.turns()).toBe(1)
    expect(closes).toBe(0)
    expect(result.message.content).toBe('all done')
  })

  test('a failing summary call costs the summary, never the run', async () => {
    const stop = new AbortController()
    const scripted = scriptedModel([
      { before: () => { stop.abort() }, toolCalls: [{ name: 'echo', args: { value: 'a' } }] },
      { error: 'provider down' },
    ])
    const agent = makeAgentModel({ exec: execution(), agentModel: scripted.model, tools: { echo } })

    const result = await agent.invoke('work', { stop: stop.signal })

    expect(result.stopped).toBe(true)
    expect(result.message.content).toBe('')
  })

  test('messages drained between rounds reach the next call as ONE turn, after the tool results', async () => {
    const queue = ['also check B', 'and C']
    let drains = 0
    const inbox: AgentInbox = {
      drain: async () => { drains++; return queue.splice(0) },
      drainOrClose: async () => [],
    }
    const scripted = scriptedModel([
      { toolCalls: [{ name: 'echo', args: { value: 'hi' } }] },
      { content: 'done' },
    ])
    const agent = makeAgentModel({ exec: execution(), agentModel: scripted.model, tools: { echo } })

    const result = await agent.invoke('work', { inbox })

    // Before every model call after the first — never before the first.
    expect(drains).toBe(1)
    expect(JSON.stringify(scripted.asked()[0])).not.toContain(AGENT_INBOX_PREFIX)
    const second = scripted.asked()[1]!
    expect(last(second)).toBeInstanceOf(HumanMessage)
    expect(contentOf(last(second))).toBe(`${AGENT_INBOX_PREFIX}\n\nalso check B\n\nand C`)
    expect(second[second.length - 2]).toBeInstanceOf(ToolMessage)
    expect(result.messages.some(message => contentOf(message).includes('also check B'))).toBe(true)
    expect(result.stopped).toBeUndefined()
  })

  test('a message waiting where the run would end keeps the loop going', async () => {
    const late = [['and one more thing'], []]
    let closes = 0
    const inbox: AgentInbox = {
      drain: async () => [],
      drainOrClose: async () => { closes++; return late.shift() ?? [] },
    }
    const scripted = scriptedModel([{ content: 'first answer' }, { content: 'second answer' }])
    const agent = makeAgentModel({ exec: execution(), agentModel: scripted.model, tools: {} })

    const result = await agent.invoke('work', { inbox })

    expect(scripted.turns()).toBe(2)
    expect(closes).toBe(2)
    expect(contentOf(last(scripted.asked()[1]!))).toBe(`${AGENT_INBOX_PREFIX}\n\nand one more thing`)
    expect(scripted.asked()[1]!.map(contentOf)).toContain('first answer')
    expect(result.message.content).toBe('second answer')
  })

  test('a failing inbox is treated as empty and never fails the run', async () => {
    const inbox: AgentInbox = {
      drain: async () => { throw new Error('inbox down') },
      drainOrClose: async () => { throw new Error('inbox down') },
    }
    const scripted = scriptedModel([
      { toolCalls: [{ name: 'echo', args: { value: 'hi' } }] },
      { content: 'done' },
    ])
    const agent = makeAgentModel({ exec: execution(), agentModel: scripted.model, tools: { echo } })

    const result = await agent.invoke('work', { inbox })

    expect(result.message.content).toBe('done')
    expect(scripted.turns()).toBe(2)
  })
})
