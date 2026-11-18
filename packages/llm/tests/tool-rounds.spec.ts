import { configureLog, logConfig } from '@owlmeans/log'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { AIMessage, ToolMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { tool } from '@langchain/core/tools'
import { ModelProvider } from '@owlmeans/llm-common'
import {
  anthropicPlugin, LlmMissconfiguredError, LlmOutputRejection, llmTransportRegistry, makeLlmModel, makeLlmService,
} from '@owlmeans/llm'
import type { LlmCallTools, LlmLoopCacheHints, LlmStopTool, RefferedResult } from '@owlmeans/llm'
import { recordingSpectator } from './context.js'
import {
  composedModel, goldenInput, nullSpectator, registerAnthropicLike, runGoldenCalls, scriptedModel, SpecifiedSchema,
  type CapturedRequest, type MessageShape, type Specified,
} from './tool-fixtures.js'
import { TOOLLESS_GOLDEN } from './tool-golden.js'
import { STOP_TOOL_ACCEPTED, TOOL_CALL_NOT_RUN, TOOL_ROUNDS_NOTE_HEADER, TOOL_ROUNDS_SPENT } from '../src/utils/rounds/consts.js'
import { CARRIED_LOOKUPS_HEADER, TOOL_ERROR_PREFIX } from '../src/utils/tool-calls/consts.js'

/**
 * Look tools inside ONE `ask` / `invoke` (`LlmCallTools`): rounds within an attempt, stop tools,
 * the answer-now turn, transcript carry-over on a retry, the plain call on a rung without tools,
 * spectating, continuation and cache marks per round. Offline — scripted models record every request.
 */

const UNCHANGED = '<<unchanged>>'

let level: ReturnType<typeof logConfig>['level']
beforeAll(() => { level = logConfig().level; configureLog({ level: 'silent' }) })
afterAll(() => { configureLog({ level }) })

/** A read-only look tool that counts its runs; `fail` makes it throw that instead. */
const reader = (fail?: () => Error) => {
  const runs: string[] = []
  const read = tool(async ({ path }: { path: string }) => {
    runs.push(path)
    if (fail != null) throw fail()
    return `content of ${path}`
  }, {
    name: 'read', description: 'Read one file of the project.',
    schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  })

  return { read, runs }
}

const keep = <T>(value: T): LlmStopTool<T> => ({
  name: 'keep', description: 'The existing file needs no change.',
  parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  value: () => value,
})

const plainLlm = (model: BaseChatModel, retries = 4, spectator = nullSpectator) =>
  makeLlmModel({ model, purpose: { type: 'tool-spec' }, retries }, spectator)

/** The kinds of a request's messages — `ai+calls` for an assistant turn that calls tools. */
const kindsOf = (shapes: MessageShape[]): string[] => shapes.map(shape => shape.calls > 0 ? `${shape.type}+calls` : shape.type)

const toolNames = (request: CapturedRequest): string[] => (request.tools ?? [])
  .map(entry => (entry as { name?: string, function?: { name: string } }).function?.name ?? (entry as { name: string }).name)

describe('@owlmeans/llm — tool rounds: absent means unchanged', () => {
  test('a call without tools sends exactly the recorded requests', async () => {
    expect(await runGoldenCalls()).toEqual(TOOLLESS_GOLDEN)
  })

  test('a rung without bindTools takes the plain call — the same request a call without tools sends', async () => {
    const { read } = reader()
    const withTools = scriptedModel([{ content: 'answer' }], { tools: false })
    const without = scriptedModel([{ content: 'answer' }], { tools: false })
    const ref: RefferedResult<AIMessage> = {}

    expect(await plainLlm(withTools.model).ask('Write it.', { action: 'no-bind', ref, tools: { tools: [read] } })).toBe('answer')
    await plainLlm(without.model).ask('Write it.', { action: 'no-bind' })

    expect(withTools.sent).toEqual(without.sent)
    expect(withTools.sent[0]!.tools).toBeUndefined()
    expect(ref.conversation?.tooled).toBe(false)
    expect(ref.conversation?.rounds).toBe(0)
  })

  test('an ask with no tool to declare takes the plain call', async () => {
    const scripted = scriptedModel([{ content: 'answer' }])
    const ref: RefferedResult<AIMessage> = {}
    expect(await plainLlm(scripted.model).ask('Write it.', { action: 'nothing-declared', ref, tools: { tools: [] } })).toBe('answer')
    expect(scripted.sent[0]!.tools).toBeUndefined()
    expect(ref.conversation?.tooled).toBe(false)
  })

  test('a plugin that refuses tools takes the plain call too', async () => {
    const { read, runs } = reader()
    const scripted = scriptedModel([{ content: 'plain answer' }], { provider: 'spec-no-tools', modelName: 'claude-haiku-4-5' })
    registerAnthropicLike('spec-no-tools', [scripted.model], { toolCalling: () => false })
    const ref: RefferedResult<AIMessage> = {}

    expect(await plainLlm(scripted.model).ask('Write it.', { action: 'refused-tools', ref, tools: { tools: [read] } }))
      .toBe('plain answer')
    expect(scripted.sent[0]!.tools).toBeUndefined()
    expect(runs).toEqual([])
    expect(ref.conversation?.tooled).toBe(false)
  })
})

describe('@owlmeans/llm — tool rounds: ask', () => {
  test('look rounds run, then the text answer goes through the filter', async () => {
    const { read, runs } = reader()
    const scripted = scriptedModel([
      { content: 'Let me look.', calls: [{ name: 'read', args: { path: 'a.ts' } }] },
      { content: 'the file body' },
    ])
    const counted: string[] = []
    const ref: RefferedResult<AIMessage> = {}
    const answer = await plainLlm(scripted.model).ask('Write a.ts.', {
      action: 'rounds', ref,
      filter: text => text.toUpperCase(),
      tools: { tools: [read], onToolCall: name => { counted.push(name) } },
    })

    expect(answer).toBe('THE FILE BODY')
    expect(runs).toEqual(['a.ts'])
    expect(counted).toEqual(['read'])
    expect(scripted.sent).toHaveLength(2)
    expect(toolNames(scripted.sent[0]!)).toEqual(['read'])
    // `ask` never forces a tool while it may still look.
    expect(scripted.sent[0]!.bind).toEqual({})
    expect(kindsOf(scripted.shapes[1]!)).toEqual(['user', 'ai+calls', 'tool'])
    expect(scripted.shapes[1]![2]!.text).toBe('content of a.ts')
    expect(ref.conversation?.tooled).toBe(true)
    expect(ref.conversation?.rounds).toBe(1)
  })

  test('two look calls in one turn both run and are both counted', async () => {
    const { read, runs } = reader()
    const scripted = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.ts' } }, { name: 'read', args: { path: 'b.ts' } }] },
      { content: 'done' },
    ])
    let calls = 0
    await plainLlm(scripted.model).ask('Write.', { action: 'parallel', tools: { tools: [read], onToolCall: () => { calls += 1 } } })

    expect(runs.sort()).toEqual(['a.ts', 'b.ts'])
    expect(calls).toBe(2)
    expect(scripted.shapes[1]!.filter(message => message.type === 'tool')).toHaveLength(2)
  })

  test('a stop tool returns its value at once and skips the filter', async () => {
    const { read, runs } = reader()
    const scripted = scriptedModel([{ calls: [{ name: 'keep', args: { reason: 'already right' } }] }])
    const counted: string[] = []
    const ref: RefferedResult<AIMessage> = {}
    const answer = await plainLlm(scripted.model).ask('Update a.ts if needed.', {
      action: 'keep', ref,
      filter: () => { throw new Error('the filter must not run') },
      tools: { tools: [read], stop: [keep(UNCHANGED)], onToolCall: name => { counted.push(name) } },
    })

    expect(answer).toBe(UNCHANGED)
    expect(runs).toEqual([])
    expect(counted).toEqual(['keep'])
    expect(scripted.sent).toHaveLength(1)
    expect(toolNames(scripted.sent[0]!)).toEqual(['read', 'keep'])
    expect(ref.value).toBeInstanceOf(AIMessage)
    expect(ref.conversation?.stop).toBe('keep')
    const [, call, accepted] = ref.conversation!.messages
    expect((call as AIMessage).tool_calls?.map(each => each.name)).toEqual(['keep'])
    expect((accepted as ToolMessage).content).toBe(STOP_TOOL_ACCEPTED)
  })

  test('spent rounds bring the answer-now turn, asked with no tool bound and the rounds as a note', async () => {
    const { read, runs } = reader()
    const scripted = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.ts' } }] },
      { content: 'answered' },
    ])
    const ref: RefferedResult<AIMessage> = {}
    expect(await plainLlm(scripted.model).ask('Write.', { action: 'spent', ref, tools: { tools: [read], maxRounds: 1 } })).toBe('answered')

    expect(runs).toEqual(['a.ts'])
    expect(scripted.sent[1]!.tools).toBeUndefined()
    expect(scripted.sent[1]!.bind).toBeUndefined()
    // No tool message travels without its tools: the round is a note, then "answer now".
    expect(kindsOf(scripted.shapes[1]!)).toEqual(['user', 'user', 'user'])
    expect(scripted.shapes[1]![1]!.text.startsWith(TOOL_ROUNDS_NOTE_HEADER)).toBe(true)
    expect(scripted.shapes[1]![1]!.text).toContain('### read {"path":"a.ts"}\n\ncontent of a.ts')
    expect(scripted.shapes[1]!.at(-1)).toEqual({ type: 'user', text: TOOL_ROUNDS_SPENT, calls: 0 })
    // The conversation handed back keeps the round as messages, for a later call that binds tools again.
    expect(ref.conversation!.messages.map(message => message instanceof AIMessage ? 'ai' : message instanceof ToolMessage ? 'tool' : 'user'))
      .toEqual(['user', 'ai', 'tool', 'user', 'ai'])
  })

  test('with a stop tool the spent turn keeps it callable; a look-up there is answered as not run', async () => {
    const { read, runs } = reader()
    const scripted = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.ts' } }] },
      { calls: [{ name: 'read', args: { path: 'b.ts' } }] },
      { content: 'final' },
    ])
    expect(await plainLlm(scripted.model).ask('Write.', {
      action: 'spent-stop', tools: { tools: [read], stop: [keep(UNCHANGED)], maxRounds: 1 },
    })).toBe('final')

    expect(runs).toEqual(['a.ts'])
    expect(scripted.sent).toHaveLength(3)
    // The spent turn keeps the stop tool callable; a look-up there ends it unrun and the answer is asked tool-less.
    expect(toolNames(scripted.sent[1]!)).toEqual(['read', 'keep'])
    expect(scripted.sent[1]!.bind).toEqual({})
    expect(scripted.sent[2]!.tools).toBeUndefined()
    expect(kindsOf(scripted.shapes[2]!)).toEqual(['user', 'user', 'user'])
    expect(scripted.shapes[2]![1]!.text).toContain('### read {"path":"a.ts"}')
    expect(scripted.shapes[2]![1]!.text).not.toContain('b.ts')
  })

  test('the caller\'s own budget ends looking like spent rounds', async () => {
    const { read, runs } = reader()
    const scripted = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.ts' } }] },
      { content: 'answered' },
    ])
    await plainLlm(scripted.model).ask('Write.', {
      action: 'exhausted', tools: { tools: [read], maxRounds: 5, exhausted: () => runs.length > 0 },
    })

    expect(runs).toEqual(['a.ts'])
    expect(scripted.sent[1]!.tools).toBeUndefined()
  })

  test('a tool error becomes the tool message the model reads', async () => {
    const { read } = reader(() => new Error('no such file'))
    const scripted = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'gone.ts' } }] },
      { content: 'answered anyway' },
    ])
    expect(await plainLlm(scripted.model).ask('Write.', { action: 'tool-error', tools: { tools: [read] } })).toBe('answered anyway')

    const result = scripted.sent[1]!.messages.at(-1)!.kwargs as { content: string, status: string }
    expect(result.content).toBe(`${TOOL_ERROR_PREFIX}no such file`)
    expect(result.status).toBe('error')
  })

  test('a fatal tool error ends the call without a retry', async () => {
    const { read } = reader(() => new LlmMissconfiguredError('out of budget'))
    const scripted = scriptedModel([{ calls: [{ name: 'read', args: { path: 'a.ts' } }] }])
    await expect(plainLlm(scripted.model).ask('Write.', { action: 'fatal-tool', tools: { tools: [read] } }))
      .rejects.toBeInstanceOf(LlmMissconfiguredError)
    expect(scripted.sent).toHaveLength(1)

    class Halt extends Error {}
    const halting = reader(() => new Halt('stopped by the person'))
    const again = scriptedModel([{ calls: [{ name: 'read', args: { path: 'a.ts' } }] }])
    await expect(plainLlm(again.model).ask('Write.', {
      action: 'fatal-own', fatal: e => e instanceof Halt ? e : null, tools: { tools: [halting.read] },
    })).rejects.toBeInstanceOf(Halt)
    expect(again.sent).toHaveLength(1)
  })

  test('two tools of one name are refused before any request', async () => {
    const { read } = reader()
    const scripted = scriptedModel([{ content: 'x' }])
    await expect(plainLlm(scripted.model).ask('Write.', {
      action: 'duplicate', tools: { tools: [read], stop: [{ ...keep(UNCHANGED), name: 'read' }] },
    })).rejects.toBeInstanceOf(LlmMissconfiguredError)
    expect(scripted.sent).toHaveLength(0)
  })

  test('every model turn is spectated; look rounds under the rounds action', async () => {
    const { read } = reader()
    const spectator = recordingSpectator()
    const scripted = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.ts' } }] },
      { calls: [{ name: 'read', args: { path: 'b.ts' } }] },
      { content: 'done' },
    ])
    const ref: RefferedResult<AIMessage> = {}
    await plainLlm(scripted.model, 4, spectator).ask('Write.', {
      action: 'write-file', ref, tools: { tools: [read], action: 'hybrid:spec:look' },
    })

    expect(spectator.entries.map(entry => entry.action)).toEqual(['hybrid:spec:look', 'hybrid:spec:look', 'write-file'])
    // Usage of every round reaches the spectator.
    expect(spectator.entries.map(entry => entry.messages.at(-1)!.usage?.input_tokens)).toEqual([10, 20, 30])
    expect(ref.spectatorEntry).toBe(spectator.entries[2]!)
  })

  test('the conversation can be continued in a later call', async () => {
    const { read } = reader()
    const first = scriptedModel([
      { content: 'Looking.', calls: [{ name: 'read', args: { path: 'a.ts' } }] },
      { content: 'version one' },
    ])
    const ref: RefferedResult<AIMessage> = {}
    await plainLlm(first.model).ask('Write a.ts.', { action: 'write', ref, tools: { tools: [read] } })

    const messages = ref.conversation!.messages
    expect(messages).toHaveLength(4)
    expect(messages[1]).toBeInstanceOf(AIMessage)
    expect((messages[1] as AIMessage).content).toBe('Looking.')
    expect((messages[1] as AIMessage).tool_calls?.map(call => call.args)).toEqual([{ path: 'a.ts' }])
    expect((messages[3] as AIMessage).content).toBe('version one')

    const second = scriptedModel([{ content: 'version two' }])
    expect(await plainLlm(second.model).ask([...messages, 'The build says: fix the import.'], {
      action: 'revise', tools: { tools: [read] },
    })).toBe('version two')
    expect(kindsOf(second.shapes[0]!))
      .toEqual(['user', 'ai+calls', 'tool', 'ai', 'user'])
  })
})

describe('@owlmeans/llm — tool rounds: retries carry the look-ups', () => {
  test('a filter refusal is retried with the transcript: the tool is not run again', async () => {
    const { read, runs } = reader()
    const scripted = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.ts' } }] },
      { content: 'Заказы' },
      { content: 'Orders' },
    ])
    const ref: RefferedResult<AIMessage> = {}
    const answer = await plainLlm(scripted.model).ask('Name it.', {
      action: 'carry', ref,
      filter: text => {
        if (/^[A-Za-z]+$/.test(text)) return text
        throw new LlmOutputRejection('non-latin', { text })
      },
      guide: () => 'Use Latin letters.',
      tools: { tools: [read] },
    })

    expect(answer).toBe('Orders')
    expect(runs).toEqual(['a.ts'])
    expect(scripted.sent).toHaveLength(3)
    // The carried round stays after the opening, the guidance follows it; nothing is looked up again.
    expect(kindsOf(scripted.shapes[2]!)).toEqual(['user', 'ai+calls', 'tool', 'user'])
    expect(scripted.shapes[2]!.at(-1)!.text).toBe('Use Latin letters.')
    expect(ref.conversation?.rounds).toBe(0)
    expect(ref.conversation!.messages.map(message => message instanceof AIMessage ? 'ai' : message instanceof ToolMessage ? 'tool' : 'user'))
      .toEqual(['user', 'ai', 'tool', 'user', 'ai'])
  })

  test('a turn that streamed nothing is retried with the rounds before it', async () => {
    const { read, runs } = reader()
    const scripted = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.ts' } }] },
      { empty: true },
      { content: 'answered' },
    ])
    expect(await plainLlm(scripted.model).ask('Write.', { action: 'null-turn', tools: { tools: [read] } })).toBe('answered')
    expect(runs).toEqual(['a.ts'])
    expect(kindsOf(scripted.shapes[2]!)).toEqual(['user', 'ai+calls', 'tool'])
  })

  test('a fallback rung without tools gets the look-ups as a note', async () => {
    const { read, runs } = reader()
    const primary = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.ts' } }] },
      { content: 'bad' },
    ])
    const fallback = scriptedModel([{ content: 'good' }], { tools: false, modelName: 'fallback' })
    ;(primary.model as unknown as { __fallbackModel: BaseChatModel }).__fallbackModel = fallback.model
    const ref: RefferedResult<AIMessage> = {}
    expect(await plainLlm(primary.model, 5).ask('Write.', {
      action: 'note', ref, filter: text => text === 'good' ? text : null, tools: { tools: [read] },
    })).toBe('good')

    expect(runs).toEqual(['a.ts'])
    expect(fallback.sent).toHaveLength(1)
    expect(fallback.sent[0]!.tools).toBeUndefined()
    const shape = fallback.shapes[0]!
    expect(kindsOf(shape)).toEqual(['user', 'user'])
    expect(shape[1]!.text.startsWith(CARRIED_LOOKUPS_HEADER)).toBe(true)
    expect(shape[1]!.text).toContain('### read {"path":"a.ts"}\n\ncontent of a.ts')
    expect(ref.conversation?.tooled).toBe(false)
  })
})

describe('@owlmeans/llm — tool rounds: invoke', () => {
  test('look tools, then the output tool; the model must call one of them', async () => {
    const { read, runs } = reader()
    const scripted = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'design.md' } }] },
      { calls: [{ name: 'Specified', args: { title: 'T', summary: 'S' } }] },
    ])
    const ref: RefferedResult<AIMessage> = {}
    const result = await plainLlm(scripted.model).invoke('Describe it.', SpecifiedSchema, {
      action: 'describe', ref, tools: { tools: [read] },
    })

    expect(result).toEqual({ title: 'T', summary: 'S' })
    expect(runs).toEqual(['design.md'])
    expect(toolNames(scripted.sent[0]!)).toEqual(['read', 'Specified'])
    expect(scripted.sent[0]!.bind).toEqual({ tool_choice: 'any' })
    expect(JSON.parse(String((ref.conversation!.messages.at(-1) as AIMessage).content))).toEqual({ title: 'T', summary: 'S' })
  })

  test('a turn that answers in words is asked again within the attempt, with the output tool pinned', async () => {
    // The live shape: a proxy that ignores a forced "any tool" choice; the model answered a markdown list.
    const { read } = reader()
    const scripted = scriptedModel([
      { content: '- Workshop\n- Session\n- Booking' },
      { calls: [{ name: 'Specified', args: { title: 'T', summary: 'S' } }] },
    ])
    const result = await plainLlm(scripted.model).invoke('Describe it.', SpecifiedSchema, {
      action: 'describe', tools: { tools: [read] },
    })

    expect(result).toEqual({ title: 'T', summary: 'S' })
    expect(scripted.sent).toHaveLength(2)
    expect(scripted.sent[0]!.bind).toEqual({ tool_choice: 'any' })
    expect(scripted.sent[1]!.bind).toEqual({ tool_choice: { type: 'function', function: { name: 'Specified' } } })
  })

  test('a stop tool returns its object, bypassing the schema', async () => {
    const scripted = scriptedModel([{ calls: [{ name: 'keep', args: { reason: 'fine' } }] }])
    const kept = { title: UNCHANGED } as unknown as Specified
    const tools: LlmCallTools<Specified> = { tools: [], stop: [keep(kept)] }
    expect(await plainLlm(scripted.model).invoke('Describe it.', SpecifiedSchema, { action: 'keep-invoke', tools })).toBe(kept)
  })

  test('a model that refuses a forced tool looks with auto; spent rounds pin the output tool', async () => {
    const { read } = reader()
    const refusing = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.md' } }] },
      { calls: [{ name: 'Specified', args: { title: 'T', summary: 'S' } }] },
    ], { provider: 'spec-refusing', modelName: 'claude-sonnet-5-5' })
    registerAnthropicLike('spec-refusing', [refusing.model])
    await plainLlm(refusing.model).invoke('Describe it.', SpecifiedSchema, { action: 'auto', tools: { tools: [read] } })
    expect(refusing.sent[0]!.bind).toEqual({ tool_choice: 'auto' })

    const pinning = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.md' } }] },
      { calls: [{ name: 'Specified', args: { title: 'T', summary: 'S' } }] },
    ], { provider: 'spec-pinning', modelName: 'claude-haiku-4-5' })
    registerAnthropicLike('spec-pinning', [pinning.model])
    await plainLlm(pinning.model).invoke('Describe it.', SpecifiedSchema, { action: 'pin', tools: { tools: [read], maxRounds: 1 } })
    expect(pinning.sent[0]!.bind).toEqual({ tool_choice: 'any' })
    expect(pinning.sent[1]!.bind).toEqual({ tool_choice: { type: 'tool', name: 'Specified' } })
  })

  test('with a tail placement a conversing rung still answers through the output tool', async () => {
    const scripted = scriptedModel([{ calls: [{ name: 'Specified', args: { title: 'T', summary: 'S' } }] }])
    expect(await plainLlm(scripted.model).invoke('Describe it.', SpecifiedSchema, {
      action: 'tail-tools', schemaPlacement: 'tail', tools: { tools: [] },
    })).toEqual({ title: 'T', summary: 'S' })
    expect(toolNames(scripted.sent[0]!)).toEqual(['Specified'])
    expect(JSON.stringify(scripted.sent[0]!.messages)).not.toContain('valid against this JSON Schema')
  })

  test('a schema refusal is guided with the carried look-ups', async () => {
    const { read, runs } = reader()
    const scripted = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.md' } }] },
      { calls: [{ name: 'Specified', args: { title: 'T' } }] },
      { calls: [{ name: 'Specified', args: { title: 'T', summary: 'S' } }] },
    ])
    expect(await plainLlm(scripted.model).invoke('Describe it.', SpecifiedSchema, {
      action: 'schema-carry', guide: () => 'The answer needs a summary.', tools: { tools: [read] },
    })).toEqual({ title: 'T', summary: 'S' })
    expect(runs).toEqual(['a.md'])
    expect(scripted.shapes[2]!.at(-1)!.text).toBe('The answer needs a summary.')
  })
})

describe('@owlmeans/llm — tool rounds: through real provider clients', () => {
  const service = makeLlmService({
    models: () => [
      { alias: 'claude', provider: ModelProvider.Anthropic, model: 'claude-haiku-4-5-20251001', secret: 'sk-ant' },
      { alias: 'chat', provider: ModelProvider.OpenAI, model: 'gpt-4.1-mini', secret: 'sk-oa' },
    ],
  }, 'llm-tool-rounds-spec')
  const realLlm = (alias: string) =>
    makeLlmModel({ model: service.getModel(alias, {}, true), purpose: { type: 'tool-spec' }, retries: 1 }, nullSpectator)

  /** A transport answering each request with the next SSE body of the script, recording the JSON it was sent. */
  const sseScript = (provider: string, bodies: string[]): Array<Record<string, unknown>> => {
    const sent: Array<Record<string, unknown>> = []
    llmTransportRegistry.attach(provider, {
      fetch: () => async (_input, init) => {
        sent.push(typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {})
        const body = bodies[Math.min(sent.length - 1, bodies.length - 1)]!
        return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      },
    })
    return sent
  }

  const chatChunk = (delta: Record<string, unknown>, finish: string | null): string => `data: ${JSON.stringify({
    id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'gpt-4.1-mini', choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`
  const chatCall = (name: string, args: Record<string, unknown>): string => chatChunk({
    role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }],
  }, null) + chatChunk({}, 'tool_calls') + 'data: [DONE]\n\n'
  const chatText = (text: string): string => chatChunk({ role: 'assistant', content: text }, null) + chatChunk({}, 'stop') + 'data: [DONE]\n\n'

  const event = (type: string, data: Record<string, unknown>): string => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
  const claudeMessage = (block: Record<string, unknown>, delta: Record<string, unknown>, stop: string): string =>
    event('message_start', {
      message: {
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [],
        stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 },
      },
    })
    + event('content_block_start', { index: 0, content_block: block })
    + event('content_block_delta', { index: 0, delta })
    + event('content_block_stop', { index: 0 })
    + event('message_delta', { delta: { stop_reason: stop }, usage: { output_tokens: 5 } })
    + event('message_stop', {})

  afterEach(() => {
    llmTransportRegistry.detach(ModelProvider.OpenAI)
    llmTransportRegistry.detach(ModelProvider.Anthropic)
  })

  test('chat completions: the look tools are declared, the round goes back as assistant tool calls and a tool message', async () => {
    const { read, runs } = reader()
    const sent = sseScript(ModelProvider.OpenAI, [chatCall('read', { path: 'a.ts' }), chatText('done')])
    expect(await realLlm('chat').ask('Write a.ts.', { action: 'wire-chat', tools: { tools: [read], maxRounds: 1 } })).toBe('done')

    expect(runs).toEqual(['a.ts'])
    expect((sent[0]!.tools as Array<{ function: { name: string } }>).map(entry => entry.function.name)).toEqual(['read'])
    expect(sent[0]!.tool_choice).toBeUndefined()
    // The answering turn declares no tool and carries no tool message: the round travels as a note.
    expect(sent[1]!.tools).toBeUndefined()
    expect(sent[1]!.tool_choice).toBeUndefined()
    const messages = sent[1]!.messages as Array<Record<string, unknown>>
    expect(messages.map(message => message.role)).toEqual(['user', 'user', 'user'])
    expect(String(messages[1]!.content)).toContain('### read {"path":"a.ts"}\n\ncontent of a.ts')
    expect(messages[2]).toMatchObject({ role: 'user', content: TOOL_ROUNDS_SPENT })
  })

  test('chat completions: a round the provider continues from its tool calls goes back as assistant tool calls and a tool message', async () => {
    const { read } = reader()
    const sent = sseScript(ModelProvider.OpenAI, [chatCall('read', { path: 'a.ts' }), chatText('done')])
    expect(await realLlm('chat').ask('Write a.ts.', { action: 'wire-chat-2', tools: { tools: [read], maxRounds: 2 } })).toBe('done')

    const messages = sent[1]!.messages as Array<Record<string, unknown>>
    expect(messages[1]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'call_1', function: { name: 'read' } }] })
    expect(messages[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_1', content: 'content of a.ts' })
  })

  test('chat completions: invoke must call a tool — required while looking', async () => {
    const { read } = reader()
    const sent = sseScript(ModelProvider.OpenAI, [chatCall('read', { path: 'a.md' }), chatCall('Specified', { title: 'T', summary: 'S' })])
    expect(await realLlm('chat').invoke('Describe it.', SpecifiedSchema, { action: 'wire-invoke', tools: { tools: [read] } }))
      .toEqual({ title: 'T', summary: 'S' })
    expect(sent[0]!.tool_choice).toBe('required')
    expect((sent[0]!.tools as Array<{ function: { name: string } }>).map(entry => entry.function.name)).toEqual(['read', 'Specified'])
  })

  test('anthropic: a streamed tool_use goes back as tool_use and tool_result blocks; the stop tool ends the call', async () => {
    const { read, runs } = reader()
    const sent = sseScript(ModelProvider.Anthropic, [
      claudeMessage(
        { type: 'tool_use', id: 'toolu_1', name: 'read', input: {} },
        { type: 'input_json_delta', partial_json: '{"path":"a.ts"}' }, 'tool_use',
      ),
      claudeMessage(
        { type: 'tool_use', id: 'toolu_2', name: 'keep', input: {} },
        { type: 'input_json_delta', partial_json: '{"reason":"fine"}' }, 'tool_use',
      ),
    ])
    expect(await realLlm('claude').ask('Update a.ts if needed.', {
      action: 'wire-claude', tools: { tools: [read], stop: [keep(UNCHANGED)] },
    })).toBe(UNCHANGED)

    expect(runs).toEqual(['a.ts'])
    expect((sent[0]!.tools as Array<{ name: string }>).map(entry => entry.name)).toEqual(['read', 'keep'])
    const messages = sent[1]!.messages as Array<{ role: string, content: Array<Record<string, unknown>> }>
    expect(messages[1]!.role).toBe('assistant')
    expect(messages[1]!.content.find(block => block.type === 'tool_use')).toMatchObject({ id: 'toolu_1', name: 'read', input: { path: 'a.ts' } })
    expect(messages[2]!.content.find(block => block.type === 'tool_result')).toMatchObject({ tool_use_id: 'toolu_1' })
  })
})

describe('@owlmeans/llm — tool rounds: cache marks per round', () => {
  test('the first turn is the plain request\'s marking; every later turn is re-marked by loopCache', async () => {
    const { read } = reader()
    const hints: LlmLoopCacheHints[] = []
    const scripted = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.ts' } }] },
      { calls: [{ name: 'read', args: { path: 'b.ts' } }] },
      { content: 'done' },
    ], { provider: 'spec-loop-cache', modelName: 'claude-haiku-4-5' })
    registerAnthropicLike('spec-loop-cache', [scripted.model], {
      loopCache: (messages, model, given) => {
        hints.push(given!)
        return anthropicPlugin.loopCache!(messages, model, given)
      },
    })
    await composedModel(scripted.model, 'spec-loop-cache').ask(goldenInput(), {
      action: 'cached', stable: 1, tools: { tools: [read] },
    })

    expect(scripted.sent).toHaveLength(3)
    // Turn 0: exactly what the call sends without tools — no automatic marker.
    expect(scripted.sent[0]!.options.cache_control).toBeUndefined()
    const lead = scripted.sent[0]!.messages[2]!
    expect(JSON.stringify(lead)).toContain('cache_control')
    // Turns 1 and 2: the opening marked again (system split, project message), plus the automatic marker.
    expect(hints).toHaveLength(2)
    expect(hints[0]!.system?.length).toBeGreaterThan(0)
    expect(hints[0]!.project).toBe(1)
    for (const turn of scripted.sent.slice(1)) {
      expect(turn.options.cache_control).toEqual({ type: 'ephemeral' })
      expect(JSON.stringify(turn.messages[0])).toContain('cache_control')
    }
  })

  test('cacheMax 0 keeps the rounds unmarked', async () => {
    const { read } = reader()
    let called = 0
    const scripted = scriptedModel([
      { calls: [{ name: 'read', args: { path: 'a.ts' } }] },
      { content: 'done' },
    ], { provider: 'spec-no-cache', modelName: 'claude-haiku-4-5' })
    registerAnthropicLike('spec-no-cache', [scripted.model], {
      loopCache: (messages, model, given) => { called += 1; return anthropicPlugin.loopCache!(messages, model, given) },
    })
    await composedModel(scripted.model, 'spec-no-cache').ask('Write.', { action: 'uncached', cacheMax: 0, tools: { tools: [read] } })

    expect(called).toBe(0)
    expect(JSON.stringify(scripted.sent[1]!)).not.toContain('cache_control')
  })
})
