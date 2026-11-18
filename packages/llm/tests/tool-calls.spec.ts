import { configureLog, logConfig } from '@owlmeans/log'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { tool } from '@langchain/core/tools'
import { ModelProvider } from '@owlmeans/llm-common'
import {
  llmPluginRegistry, llmTransportRegistry, LlmOutputRejection, makeLlmModel, makeLlmService, openAiPlugin, toolCallsHelper,
} from '@owlmeans/llm'
import type { LlmPlugin, RefferedResult } from '@owlmeans/llm'
import { recordingSpectator } from './context.js'
import { nullSpectator, scriptedModel, SpecifiedSchema, type MessageShape } from './tool-fixtures.js'
import { TOOL_CALL_NOT_RUN, TOOL_ROUNDS_NOTE_HEADER, TOOL_ROUNDS_SPENT } from '../src/utils/rounds/consts.js'

/**
 * Parallel tool calls whose streamed arguments were lost (`toolCallsHelper`, `LlmPlugin.toolCallsOf`),
 * and the turns that may no longer look: `ask`'s tool-less answer, `invoke`'s pinned output turn, a
 * retry whose budget is already spent. Offline — scripted streams in the live shapes.
 */

let level: ReturnType<typeof logConfig>['level']
beforeAll(() => { level = logConfig().level; configureLog({ level: 'silent' }) })
afterAll(() => { configureLog({ level }) })

/** The four calls of the live round (ab-hybrid-1, a coder `ask` with look tools). */
const LIVE_CALLS = [
  { id: 'call_b01c', name: 'read_file', args: { path: 'sources/common/src/entrypoints.ts' } },
  { id: 'call_39b4', name: 'read_file', args: { path: 'sources/backend/src/models/flow/flow.ts' } },
  { id: 'call_0d62', name: 'read_file', args: { path: 'sources/backend/src/models/ticket-template/ticket-template.ts' } },
  { id: 'call_12e8', name: 'list_files', args: { pattern: 'sources/api/src/app/ticket/**' } },
]

/** A look tool that records what it was asked and refuses a call without its required argument. */
const lookTools = () => {
  const runs: string[] = []
  const readFile = tool(async ({ path }: { path: string }) => {
    runs.push(`read ${path}`)
    return `content of ${path}`
  }, {
    name: 'read_file', description: 'Read a source file.',
    schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  })
  const listFiles = tool(async ({ pattern }: { pattern?: string }) => {
    runs.push(`list ${pattern ?? '*'}`)
    return `files matching ${pattern ?? '*'}`
  }, {
    name: 'list_files', description: 'List source files.',
    schema: { type: 'object', properties: { pattern: { type: 'string' } } },
  })

  return { tools: [readFile, listFiles], runs }
}

/**
 * One streamed answer in the live shape: each call's header chunk (id, name, its position, empty
 * arguments), then its argument fragments with `index` (none, or one shared by every fragment), then
 * the final chunk whose `response_metadata.output` repeats every function call whole.
 */
const liveChunks = (fragmentIndex?: number): AIMessageChunk[] => [
  new AIMessageChunk({ content: [], id: 'resp_1', response_metadata: { model_provider: 'openai', model: 'gpt-6-luna' } }),
  ...LIVE_CALLS.flatMap((call, i) => {
    const text = JSON.stringify(call.args)
    const half = Math.floor(text.length / 2)
    return [
      new AIMessageChunk({
        content: [], tool_call_chunks: [{ type: 'tool_call_chunk', id: call.id, name: call.name, args: '', index: i + 1 }],
        additional_kwargs: { __openai_function_call_ids__: { [call.id]: `fc_${i}` } },
      }),
      ...[text.slice(0, half), text.slice(half)].map(args => new AIMessageChunk({
        content: [], tool_call_chunks: [{ type: 'tool_call_chunk', args, ...(fragmentIndex != null ? { index: fragmentIndex } : {}) }],
      })),
    ]
  }),
  new AIMessageChunk({
    content: [],
    response_metadata: {
      model_provider: 'openai', model: 'gpt-6-luna',
      output: [
        { type: 'reasoning', id: 'rs_1', summary: [] },
        ...LIVE_CALLS.map((call, i) => ({
          type: 'function_call', id: `fc_${i}`, call_id: call.id, name: call.name, arguments: JSON.stringify(call.args), status: 'completed',
        })),
      ],
    },
    usage_metadata: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
  }),
]

const concat = (chunks: AIMessageChunk[]): AIMessageChunk => chunks.reduce((piece, chunk) => piece.concat(chunk))

/** The OpenAI plugin under a spec-only provider name, owning nothing but the given models. */
const registerOpenAiLike = (provider: string, models: BaseChatModel[]): LlmPlugin => {
  const plugin: LlmPlugin = { ...openAiPlugin, type: provider, owns: candidate => models.includes(candidate), refine: ({ base }) => base }
  llmPluginRegistry.register(plugin)

  return plugin
}

const plainLlm = (model: BaseChatModel, retries = 4, spectator = nullSpectator) =>
  makeLlmModel({ model, purpose: { type: 'tool-spec' }, retries }, spectator)

const kindsOf = (shapes: MessageShape[]): string[] => shapes.map(shape => shape.calls > 0 ? `${shape.type}+calls` : shape.type)

describe('@owlmeans/llm — toolCallsHelper', () => {
  test('langchain alone loses the arguments of parallel calls whose fragments carry no position', () => {
    const piece = concat(liveChunks())
    expect(piece.tool_calls?.map(call => call.args)).toEqual([{}, {}, {}, {}])
    expect((piece.invalid_tool_calls ?? []).length).toBeGreaterThan(0)
  })

  test('the provider\'s record rebuilds every call with its arguments and its id', () => {
    const piece = concat(liveChunks())
    expect(toolCallsHelper.reconcile(piece, openAiPlugin)).toEqual(LIVE_CALLS.map(call => ({ ...call, type: 'tool_call' })))
    const message = toolCallsHelper.messageOf(piece, openAiPlugin)
    expect(message).toBeInstanceOf(AIMessage)
    expect(message.tool_calls?.map(call => [call.id, call.args])).toEqual(LIVE_CALLS.map(call => [call.id, call.args]))
    expect(message.invalid_tool_calls).toEqual([])
    expect(message.usage_metadata?.input_tokens).toBe(100)
  })

  test('without a record the chunks are regrouped by stream order', () => {
    const piece = concat(liveChunks())
    expect(toolCallsHelper.reconcile(piece).map(call => [call.id, call.name, call.args]))
      .toEqual(LIVE_CALLS.map(call => [call.id, call.name, call.args]))
  })

  test('fragments sharing one position cannot be regrouped: the record still rebuilds them, no call is dropped', () => {
    const piece = concat(liveChunks(1))
    const record = toolCallsHelper.reconcile(piece, openAiPlugin)
    expect(record.map(call => call.args)).toEqual(LIVE_CALLS.map(call => call.args))
    // Without the record nothing better than langchain's own reading exists: what parsed stays.
    const unrecorded = toolCallsHelper.reconcile(piece)
    expect(unrecorded.map(call => call.id).sort()).toEqual((piece.tool_calls ?? []).map(call => call.id).sort())
  })

  test('a completion langchain read whole is returned as it was', () => {
    const piece = new AIMessageChunk({
      content: 'Looking.', tool_calls: [{ id: 'c1', name: 'read_file', args: { path: 'a.ts' }, type: 'tool_call' }],
    })
    expect(toolCallsHelper.reconcile(piece, openAiPlugin)).toEqual(piece.tool_calls!)
    const message = toolCallsHelper.messageOf(piece, openAiPlugin)
    expect(message.tool_calls).toEqual(piece.tool_calls!)
    expect(message.content).toBe('Looking.')
  })

  test('a call the record leaves out keeps its streamed form', () => {
    const piece = new AIMessageChunk({
      content: [],
      tool_calls: [
        { id: 'c1', name: 'read_file', args: {}, type: 'tool_call' },
        { id: 'c2', name: 'list_files', args: { pattern: '*' }, type: 'tool_call' },
      ],
      response_metadata: {
        output: [{ type: 'function_call', call_id: 'c1', name: 'read_file', arguments: '{"path":"a.ts"}' }],
      },
    })
    expect(toolCallsHelper.reconcile(piece, openAiPlugin).map(call => [call.id, call.args]))
      .toEqual([['c1', { path: 'a.ts' }], ['c2', { pattern: '*' }]])
  })
})

describe('@owlmeans/llm — tool rounds: parallel calls', () => {
  test('a round of four parallel calls in the live shape runs all four with their arguments', async () => {
    const { tools, runs } = lookTools()
    const scripted = scriptedModel([{ chunks: liveChunks() }, { content: 'the handler' }], {
      provider: 'spec-responses-like', modelName: 'gpt-like',
    })
    registerOpenAiLike('spec-responses-like', [scripted.model])
    const ref: RefferedResult<AIMessage> = {}
    expect(await plainLlm(scripted.model).ask('Write the handler.', { action: 'live-parallel', ref, tools: { tools } }))
      .toBe('the handler')

    expect(runs).toEqual([
      'read sources/common/src/entrypoints.ts',
      'read sources/backend/src/models/flow/flow.ts',
      'read sources/backend/src/models/ticket-template/ticket-template.ts',
      'list sources/api/src/app/ticket/**',
    ])
    // The round goes back as the four calls with their arguments, each answered by its own result.
    expect(kindsOf(scripted.shapes[1]!)).toEqual(['user', 'ai+calls', 'tool', 'tool', 'tool', 'tool'])
    expect(scripted.shapes[1]!.slice(2).map(shape => shape.text)).toEqual([
      'content of sources/common/src/entrypoints.ts',
      'content of sources/backend/src/models/flow/flow.ts',
      'content of sources/backend/src/models/ticket-template/ticket-template.ts',
      'files matching sources/api/src/app/ticket/**',
    ])
    const sentCalls = (scripted.sent[1]!.messages[1]!.kwargs as { tool_calls: Array<{ id: string, args: unknown }> }).tool_calls
    expect(sentCalls.map(call => [call.id, call.args])).toEqual(LIVE_CALLS.map(call => [call.id, call.args]))
  })

  describe('through the Responses API client', () => {
    const service = makeLlmService({
      models: () => [{ alias: 'responses', provider: ModelProvider.OpenAI, model: 'gpt-6-luna', secret: 'sk-oa' }],
    }, 'llm-tool-calls-spec')

    const sent: Array<Record<string, unknown>> = []
    const event = (type: string, data: Record<string, unknown>): string => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
    const response = (output: unknown[], status: string) => ({
      id: 'resp_1', object: 'response', created_at: 0, model: 'gpt-6-luna', status, output,
      usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
    })
    /** Parallel function calls whose argument deltas carry no `output_index`; `response.completed` repeats them whole. */
    const parallelBody = (): string => {
      const items = LIVE_CALLS.map((call, i) => ({
        type: 'function_call', id: `fc_${i}`, call_id: call.id, name: call.name, arguments: JSON.stringify(call.args), status: 'completed',
      }))
      return event('response.created', { response: response([], 'in_progress') })
        + items.map((item, i) => event('response.output_item.added', { output_index: i, item: { ...item, arguments: '', status: 'in_progress' } })
          + event('response.function_call_arguments.delta', { item_id: item.id, delta: item.arguments })
          + event('response.output_item.done', { output_index: i, item })).join('')
        + event('response.completed', { response: response(items, 'completed') })
    }
    const textBody = (text: string): string => {
      const item = { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }
      return event('response.created', { response: response([], 'in_progress') })
        + event('response.output_item.added', { output_index: 0, item: { ...item, content: [] } })
        + event('response.output_text.delta', { output_index: 0, content_index: 0, item_id: 'msg_1', delta: text })
        + event('response.output_item.done', { output_index: 0, item })
        + event('response.completed', { response: response([item], 'completed') })
    }

    afterEach(() => {
      llmTransportRegistry.detach(ModelProvider.OpenAI)
      sent.splice(0)
    })

    test('the calls are rebuilt from response.completed and every look-up runs with its arguments', async () => {
      const bodies = [parallelBody(), textBody('the handler')]
      llmTransportRegistry.attach(ModelProvider.OpenAI, {
        fetch: () => async (_input, init) => {
          sent.push(typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {})
          return new Response(bodies[Math.min(sent.length - 1, bodies.length - 1)]!, { status: 200, headers: { 'content-type': 'text/event-stream' } })
        },
      })
      const { tools, runs } = lookTools()
      const model = makeLlmModel({ model: service.getModel('responses', {}, true), purpose: { type: 'tool-spec' }, retries: 1 }, nullSpectator)
      expect(await model.ask('Write the handler.', { action: 'responses-parallel', tools: { tools } })).toBe('the handler')

      expect(runs).toHaveLength(4)
      expect(runs[0]).toBe('read sources/common/src/entrypoints.ts')
      expect(runs[3]).toBe('list sources/api/src/app/ticket/**')
      const input = sent[1]!.input as Array<Record<string, unknown>>
      const calls = input.filter(item => item.type === 'function_call')
      expect(calls.map(item => [item.call_id, JSON.parse(String(item.arguments))])).toEqual(LIVE_CALLS.map(call => [call.id, call.args]))
      expect(input.filter(item => item.type === 'function_call_output').map(item => item.call_id)).toEqual(LIVE_CALLS.map(call => call.id))
    })
  })
})

describe('@owlmeans/llm — tool rounds: turns that may no longer look', () => {
  test('a tool-less answer that comes back as tool calls only is asked again within the attempt', async () => {
    const { tools, runs } = lookTools()
    const spectator = recordingSpectator()
    const scripted = scriptedModel([
      { calls: [{ name: 'read_file', args: { path: 'a.ts' } }] },
      { calls: [{ name: 'read_file', args: { path: 'b.ts' } }, { name: 'list_files', args: {} }] },
      { content: 'answered' },
    ])
    expect(await plainLlm(scripted.model, 4, spectator).ask('Write.', { action: 'reask', tools: { tools, maxRounds: 1 } }))
      .toBe('answered')

    expect(runs).toEqual(['read a.ts'])
    expect(scripted.sent).toHaveLength(3)
    expect(scripted.sent[1]!.tools).toBeUndefined()
    expect(scripted.sent[2]!.tools).toBeUndefined()
    expect(scripted.sent[2]!.messages).toEqual(scripted.sent[1]!.messages)
    // One attempt: three turns, none of them a retry.
    expect(spectator.entries.map(entry => entry.retries)).toEqual([0, 0, 0])
  })

  test('a retry whose look budget is already spent answers tool-less from its first turn', async () => {
    const { tools, runs } = lookTools()
    const scripted = scriptedModel([
      { calls: [{ name: 'read_file', args: { path: 'a.ts' } }] },
      { content: 'Заказы' },
      { content: 'Orders' },
    ])
    expect(await plainLlm(scripted.model).ask('Name it.', {
      action: 'spent-retry',
      filter: text => {
        if (/^[A-Za-z]+$/.test(text)) return text
        throw new LlmOutputRejection('non-latin', { text })
      },
      guide: () => 'Use Latin letters.',
      tools: { tools, maxRounds: 3, exhausted: () => runs.length > 0 },
    })).toBe('Orders')

    expect(runs).toEqual(['read a.ts'])
    expect(scripted.sent).toHaveLength(3)
    expect(scripted.sent[1]!.tools).toBeUndefined()
    // The retry: no tool bound, the earlier look-up as the note, the guidance, then "answer now".
    expect(scripted.sent[2]!.tools).toBeUndefined()
    const retry = scripted.shapes[2]!
    expect(kindsOf(retry)).toEqual(['user', 'user', 'user', 'user'])
    expect(retry[1]!.text.startsWith(TOOL_ROUNDS_NOTE_HEADER)).toBe(true)
    expect(retry[1]!.text).toContain('### read_file {"path":"a.ts"}\n\ncontent of a.ts')
    expect(retry[2]!.text).toBe('Use Latin letters.')
    expect(retry[3]!.text).toBe(TOOL_ROUNDS_SPENT)
  })

  test('invoke: an output turn answered with look calls only is asked again with the output tool pinned', async () => {
    const { tools, runs } = lookTools()
    const scripted = scriptedModel([
      { calls: [{ name: 'read_file', args: { path: 'a.md' } }] },
      { calls: [{ name: 'read_file', args: { path: 'b.md' } }] },
      { calls: [{ name: 'Specified', args: { title: 'T', summary: 'S' } }] },
    ])
    expect(await plainLlm(scripted.model).invoke('Describe it.', SpecifiedSchema, { action: 'invoke-reask', tools: { tools, maxRounds: 1 } }))
      .toEqual({ title: 'T', summary: 'S' })

    expect(runs).toEqual(['read a.md'])
    expect(scripted.sent).toHaveLength(3)
    const pinned = { tool_choice: { type: 'function', function: { name: 'Specified' } } }
    expect(scripted.sent[1]!.bind).toEqual(pinned)
    expect(scripted.sent[2]!.bind).toEqual(pinned)
    expect(scripted.shapes[2]!.at(-1)).toEqual({ type: 'tool', text: TOOL_CALL_NOT_RUN, calls: 0 })
  })
})
