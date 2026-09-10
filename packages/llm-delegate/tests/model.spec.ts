import { afterEach, describe, expect, test } from 'bun:test'
import { HumanMessage, SystemMessage, ToolMessage, AIMessage } from '@langchain/core/messages'
import {
  DelegatedMode, DelegatedResultKind, DelegatedRole, ModelProvider
} from '@owlmeans/llm-common'
import type { DelegatedResult, DelegatedTask } from '@owlmeans/llm-common'
import { DelegatedChatModel } from '../src/model.js'
import { delegatedPlugin } from '../src/plugin.js'
import { DELEGATED_SECRET } from '../src/consts.js'
import { DelegateUnavailable } from '../src/errors.js'
import { registerDelegateTransport, releaseDelegateTransport, transportFor } from '../src/transport.js'

const KEY = 'test-delegate'

/** A performer that records what it was asked and answers what the test told it to. */
const seat = (answer: (task: DelegatedTask) => DelegatedResult | Promise<DelegatedResult>) => {
  const seen: DelegatedTask[] = []
  registerDelegateTransport(KEY, {
    dispatch: async task => {
      seen.push(task)

      return await answer(task)
    },
  })

  return seen
}

const model = (): DelegatedChatModel => new DelegatedChatModel({ delegate: KEY, tier: 'strong' })

const collect = async (chat: any, messages: any[], options?: any): Promise<any> => {
  let acc: any = null
  for await (const chunk of await chat.stream(messages, options)) {
    acc = acc == null ? chunk : acc.concat(chunk)
  }

  return acc
}

afterEach(() => releaseDelegateTransport(KEY))

describe('@owlmeans/llm-delegate — what the performer is asked', () => {
  test('the system message is lifted out of the conversation', async () => {
    const seen = seat(task => ({ taskId: task.id, kind: DelegatedResultKind.Text, text: 'ok' }))

    await collect(model(), [new SystemMessage('you are a helper'), new HumanMessage('hello')])

    expect(seen[0].system).toBe('you are a helper')
    expect(seen[0].messages).toHaveLength(1)
    expect(seen[0].messages[0]).toEqual({ role: DelegatedRole.User, content: 'hello' })
  })

  test('a tool answer keeps the call it answers', async () => {
    const seen = seat(task => ({ taskId: task.id, kind: DelegatedResultKind.Text, text: 'ok' }))

    await collect(model(), [
      new HumanMessage('do it'),
      new AIMessage({ content: '', tool_calls: [{ id: 'c1', name: 'read', args: { path: 'a.ts' }, type: 'tool_call' }] }),
      new ToolMessage({ content: 'file body', tool_call_id: 'c1', name: 'read' }),
    ])

    const messages = seen[0].messages
    expect(messages[1].toolCalls).toEqual([{ id: 'c1', name: 'read', args: { path: 'a.ts' } }])
    expect(messages[2]).toMatchObject({ role: DelegatedRole.Tool, toolCallId: 'c1', name: 'read' })
  })

  test('a pinned tool is asked for as one JSON object, with its schema', async () => {
    const schema = { type: 'object', properties: { answer: { type: 'string' } } }
    const seen = seat(task => ({ taskId: task.id, kind: DelegatedResultKind.Json, json: { answer: 'yes' } }))

    const bound = model().bindTools(
      [{ type: 'function', function: { name: 'respond', description: '', parameters: schema } }],
      // The Anthropic spelling, to prove the normalizer does not care which provider's plugin
      // produced it — a performer has no provider.
      { tool_choice: { type: 'tool', name: 'respond' } }
    )
    await collect(bound, [new HumanMessage('answer')])

    expect(seen[0].mode).toBe(DelegatedMode.Json)
    expect(seen[0].toolChoice).toEqual({ name: 'respond' })
    expect(seen[0].outputSchema).toEqual(schema)
  })

  test('an open tool set is asked for as tool calls', async () => {
    const seen = seat(task => ({ taskId: task.id, kind: DelegatedResultKind.ToolCalls, toolCalls: [] }))

    const bound = model().bindTools([
      { type: 'function', function: { name: 'read', parameters: {} } },
      { type: 'function', function: { name: 'write', parameters: {} } },
    ])
    await collect(bound, [new HumanMessage('work')])

    expect(seen[0].mode).toBe(DelegatedMode.Tools)
    expect(seen[0].tools?.map(tool => tool.name)).toEqual(['read', 'write'])
  })

  test('plain prose is asked for as text', async () => {
    const seen = seat(task => ({ taskId: task.id, kind: DelegatedResultKind.Text, text: 'prose' }))

    await collect(model(), [new HumanMessage('write')])

    expect(seen[0].mode).toBe(DelegatedMode.Text)
    expect(seen[0].tools).toBeUndefined()
  })
})

describe('@owlmeans/llm-delegate — what comes back', () => {
  test('text arrives as content', async () => {
    seat(task => ({ taskId: task.id, kind: DelegatedResultKind.Text, text: 'the answer' }))

    const result = await collect(model(), [new HumanMessage('ask')])

    expect(result.content).toBe('the answer')
  })

  test('a JSON answer becomes the pinned tool call the runtime reads structured output from', async () => {
    seat(task => ({ taskId: task.id, kind: DelegatedResultKind.Json, json: { answer: 'yes' } }))

    const bound = model().bindTools(
      [{ type: 'function', function: { name: 'respond', parameters: {} } }],
      { tool_choice: { name: 'respond' } }
    )
    const result = await collect(bound, [new HumanMessage('answer')])

    expect(result.tool_calls).toHaveLength(1)
    expect(result.tool_calls[0].name).toBe('respond')
    expect(result.tool_calls[0].args).toEqual({ answer: 'yes' })
  })

  test('usage the performer reports is carried, though it costs this deployment nothing', async () => {
    seat(task => ({
      taskId: task.id, kind: DelegatedResultKind.Text, text: 'x',
      usage: { inputTokens: 11, outputTokens: 7 }, model: 'somebody-elses-model',
    }))

    const result = await collect(model(), [new HumanMessage('ask')])

    expect(result.usage_metadata).toEqual({ input_tokens: 11, output_tokens: 7, total_tokens: 18 })
    expect(result.response_metadata.model_name).toBe('somebody-elses-model')
  })

  test('an answer of nothing stays empty, so the runtime can report it as a null result', async () => {
    seat(task => ({ taskId: task.id, kind: DelegatedResultKind.Error, error: 'the subagent refused' }))

    const result = await collect(model(), [new HumanMessage('ask')])

    expect(result.content).toBe('')
    expect(result.response_metadata.finish_reason).toBe('error')
    expect(result.response_metadata.delegated_error).toBe('the subagent refused')
  })
})

describe('@owlmeans/llm-delegate — which model a log line names', () => {
  // The runtime prints `getName()` and `lc_kwargs.model` for every call it makes, and its
  // null-result report reads the same key as the model that ran. A delegated model that declared
  // neither was logged as "DelegatedChatModel undefined" — a call performed by somebody outside
  // this process, with nothing anywhere saying which one.
  test('a model built with no name at all still says what it is', () => {
    const chat = model()

    expect(chat.modelName).toBe('delegated:strong')
    expect(chat.lc_kwargs.model).toBe('delegated:strong')
  })

  test('the plugin names it from the config, and a retry keeps the name', () => {
    const built = delegatedPlugin.build({
      alias: 'coder',
      config: { alias: 'coder', provider: ModelProvider.Delegated, delegate: KEY, model: 'delegated:cheap' },
      secret: DELEGATED_SECRET,
      callbacks: [],
    }) as DelegatedChatModel

    expect(built.lc_kwargs.model).toBe('delegated:cheap')
    expect(built.role).toBe('coder')
    // A refined instance is what the NEXT attempt logs, so the name has to survive the rebuild.
    expect(built.withAttempt(1).lc_kwargs.model).toBe('delegated:cheap')
  })
})

describe('@owlmeans/llm-delegate — retries and absence', () => {
  test('a retry reaches the same performer, told it is a retry', async () => {
    const seen = seat(task => ({ taskId: task.id, kind: DelegatedResultKind.Text, text: 'ok' }))

    const first = model()
    await collect(first, [new HumanMessage('ask')])
    await collect(first.withAttempt(2, 'the previous answer was not valid JSON'), [new HumanMessage('ask')])

    expect(seen[0].attempt).toBe(0)
    expect(seen[1].attempt).toBe(2)
    expect(seen[1].feedback).toBe('the previous answer was not valid JSON')
    expect(seen[1].delegate).toBe(seen[0].delegate)
  })

  test('no performer is fatal, not a wait', () => {
    expect(() => transportFor('nobody')).toThrow(DelegateUnavailable)
    expect(() => transportFor(undefined)).toThrow(DelegateUnavailable)
  })

  test('a released transport refuses at once', async () => {
    seat(task => ({ taskId: task.id, kind: DelegatedResultKind.Text, text: 'ok' }))
    releaseDelegateTransport(KEY)

    await expect(collect(model(), [new HumanMessage('ask')])).rejects.toThrow(DelegateUnavailable)
  })
})
