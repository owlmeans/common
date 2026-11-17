import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { ChatOpenAI } from '@langchain/openai'
import { configureLog, logConfig } from '@owlmeans/log'
import { ModelEffort, ModelProvider } from '@owlmeans/llm-common'
import {
  compatiblePlugin, LlmModelError, LlmNoticeKind, makeLlmModel, makeLlmService, openAiPlugin,
} from '../src/index.js'
import type { ModelConfig } from '../src/index.js'
import { createOpenAiBackgroundHelper, openAiBackgroundHelper } from '../src/plugins/openai/background.js'
import { BackgroundMode } from '../src/plugins/openai/background/consts.js'
import type { BackgroundTimings } from '../src/plugins/openai/background/types.js'
import { sseRecordHelper } from '../src/plugins/openai/background/records.js'
import { noticeSpectator } from './scripted.js'
import { completedEvent, createdEvent, deltaEvent, responsesEvent, sleep, sseServer, within } from './sse.js'
import type { SseExchange } from './sse.js'
import { attachWire, detachAll, wireRecorder } from './wire.js'

/**
 * OpenAI background mode on the direct route: which calls ask for it, and the fetch that keeps a
 * background stream whole — complete records only, a dropped stream polled and resumed after its
 * last event, replays dropped, a finished response never resumed, a lost one a retryable stall, an
 * abandoned one cancelled. The wrapper runs against a scripted local provider over real HTTP.
 */

let level: ReturnType<typeof logConfig>['level']
beforeAll(() => { level = logConfig().level; configureLog({ level: 'silent' }) })
afterAll(() => { configureLog({ level }) })
afterEach(() => detachAll())

const ID = 'resp_bg'

const configs = (extra: Partial<ModelConfig> = {}): ModelConfig[] => [
  { alias: 'luna', provider: ModelProvider.OpenAI, model: 'gpt-6-luna', secret: 'sk-local', maxTokens: 64, ...extra },
  { alias: 'chat', provider: ModelProvider.OpenAI, model: 'gpt-4.1-mini', secret: 'sk-local', maxTokens: 64 },
  {
    alias: 'router', provider: ModelProvider.Compatible, model: 'gpt-6-luna', secret: 'sk-local',
    baseUrl: 'https://router.example.test/v1', effort: ModelEffort.High,
  },
]

const built = (alias: string, extra: Partial<ModelConfig> = {}): ChatOpenAI =>
  makeLlmService({ models: () => configs(extra) }, `llm-background-${alias}`).getModel(alias, {}, true) as ChatOpenAI

const kwargsOf = (model: unknown) => (model as ChatOpenAI).lc_kwargs as {
  modelKwargs?: Record<string, unknown>, configuration?: { fetch?: unknown },
}

/** Requests the global fetch received, answered with a 400 that nothing retries. */
const recordGlobal = (): { bodies: Record<string, unknown>[], restore: () => void } => {
  const original = globalThis.fetch
  const bodies: Record<string, unknown>[] = []
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    bodies.push(typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {})
    return new Response(JSON.stringify({ error: { message: 'recorded', type: 'invalid_request_error' } }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  return { bodies, restore: () => { globalThis.fetch = original } }
}

/** A model on the local provider whose client was built with a background-aware fetch (fast timings). */
const backgroundModel = (baseURL: string, streamTimeout = 2_000, retries = 1, timings: Partial<BackgroundTimings> = {}) => {
  const helper = createOpenAiBackgroundHelper({ silenceMs: 120, pollTimeoutMs: 1_000, cancelTimeoutMs: 1_000, retryDelayMs: 10, ...timings })
  const spectator = noticeSpectator()
  const model = makeLlmModel({
    model: new ChatOpenAI({
      apiKey: 'sk-local', model: 'gpt-6-luna', useResponsesApi: true, maxTokens: 64, maxRetries: 0, timeout: 10_000,
      configuration: { baseURL, fetch: helper.fetchFor({ background: true }) as typeof fetch },
      metadata: { config: { alias: 'luna', provider: ModelProvider.OpenAI, model: 'gpt-6-luna', streamTimeout } },
    }),
    purpose: { type: 'background-spec' }, retries,
  }, spectator)

  return { model, spectator, helper }
}

const status = (exchange: SseExchange, value: string): void => exchange.json(200, { id: ID, object: 'response', status: value })

const paths = (server: { requests: { method: string, path: string }[] }): string[] =>
  server.requests.map(request => `${request.method} ${request.path}`)

describe('@owlmeans/llm — who asks in background', () => {
  test('never at build: the client only carries a marked fetch', () => {
    const model = built('luna', { effort: ModelEffort.High, background: true })
    expect(kwargsOf(model).modelKwargs?.background).toBeUndefined()
    expect(openAiBackgroundHelper.modeOf(kwargsOf(model).configuration?.fetch)).toBe(BackgroundMode.Always)
    expect(openAiBackgroundHelper.modeOf(kwargsOf(built('luna')).configuration?.fetch)).toBe(BackgroundMode.Auto)
    expect(kwargsOf(built('luna', { background: false })).configuration?.fetch).toBeUndefined()
    expect(kwargsOf(built('chat')).configuration?.fetch).toBeUndefined()
  })

  test('a refined direct-route attempt asks at effort high and above, or always when configured', () => {
    const refined = (extra: Partial<ModelConfig>) =>
      kwargsOf(openAiPlugin.refine({ base: built('luna', extra), attempt: 0, maxOutputCap: 32_000 })).modelKwargs
    expect(refined({ effort: ModelEffort.High })?.background).toBe(true)
    expect(refined({ effort: ModelEffort.Medium })?.background).toBeUndefined()
    expect(refined({ effort: ModelEffort.Low, background: true })?.background).toBe(true)
    expect(refined({ effort: ModelEffort.High, background: false })?.background).toBeUndefined()
  })

  test('the flag reaches the wire on a model call — and never on a raw invoke', async () => {
    const wire = recordGlobal()
    try {
      const model = built('luna', { effort: ModelEffort.High })
      await makeLlmModel({ model, purpose: { type: 'background-spec' }, retries: 1 }, noticeSpectator())
        .ask('ping', { action: 'wire' }).catch(() => undefined)
      expect(wire.bodies[0]).toMatchObject({ background: true, stream: true })

      await model.invoke('ping').catch(() => undefined)
      expect(wire.bodies[1]?.background).toBeUndefined()
      // A refined instance invoked raw is not streamed: the fetch takes the flag off.
      await openAiPlugin.refine({ base: model, attempt: 0, maxOutputCap: 32_000 }).invoke('ping').catch(() => undefined)
      expect(wire.bodies[2]?.background).toBeUndefined()
      expect(wire.bodies).toHaveLength(3)
    } finally {
      wire.restore()
    }
  })

  test('a proxied route and the compatible plugin never ask', async () => {
    const rec = attachWire(ModelProvider.OpenAI, wireRecorder())
    const model = built('luna', { effort: ModelEffort.High, background: true })
    expect(openAiBackgroundHelper.modeOf(kwargsOf(model).configuration?.fetch)).toBeUndefined()
    expect(kwargsOf(openAiPlugin.refine({ base: model, attempt: 0, maxOutputCap: 32_000 })).modelKwargs?.background).toBeUndefined()
    await makeLlmModel({ model, purpose: { type: 'background-spec' }, retries: 1 }, noticeSpectator())
      .ask('ping', { action: 'proxied' }).catch(() => undefined)
    expect(rec.calls[0]?.body.background).toBeUndefined()

    const router = built('router')
    expect(openAiBackgroundHelper.modeOf(kwargsOf(router).configuration?.fetch)).toBeUndefined()
    expect(kwargsOf(compatiblePlugin.refine({ base: router, attempt: 0, maxOutputCap: 32_000 })).modelKwargs?.background).toBeUndefined()
  })
})

describe('@owlmeans/llm — what a stored response still owes the stream', () => {
  test('only the part not forwarded: an opened call gets the rest of its arguments, a new item all of it', () => {
    const delivered = { added: new Set<string>(), done: new Set<string>(), sent: new Map<string, number>() }
    for (const record of [
      `data: ${JSON.stringify({ type: 'response.output_item.added', sequence_number: 3, item: { id: 'fc_1', type: 'function_call', arguments: '' } })}`,
      `data: ${JSON.stringify({ type: 'response.function_call_arguments.delta', sequence_number: 4, item_id: 'fc_1', delta: '{"name":' })}`,
    ]) sseRecordHelper.note(delivered, sseRecordHelper.eventOf(record)!)
    const rest = sseRecordHelper.remainderOf({
      id: ID, status: 'completed',
      output: [
        { id: 'fc_1', type: 'function_call', name: 'extract', call_id: 'call_1', arguments: '{"name":"Ada"}' },
        { id: 'msg_2', type: 'message', content: [{ type: 'output_text', text: 'done' }] },
      ],
    }, delivered, 4)
    const events = rest.trim().split('\n\n').map(record => JSON.parse(record.split('\n')[1]!.slice(6)) as Record<string, unknown>)

    expect(events.map(event => event.type)).toEqual([
      'response.function_call_arguments.delta', 'response.output_item.done',
      'response.output_item.added', 'response.output_text.delta', 'response.output_item.done', 'response.completed',
    ])
    expect(events[0]).toMatchObject({ delta: '"Ada"}', sequence_number: 5 })
    expect(events[3]).toMatchObject({ item_id: 'msg_2', delta: 'done' })
    expect((events[5]!.response as { id: string }).id).toBe(ID)
  })
})

describe('@owlmeans/llm — the background stream over real HTTP', () => {
  test('a torn record is dropped, the stream resumes after its last event, a replay is dropped', async () => {
    const server = await sseServer(exchange => {
      const { method, path } = exchange.request
      if (method === 'POST') {
        exchange.event(createdEvent(ID, 0))
        exchange.event(responsesEvent('response.in_progress', 1, { response: { id: ID, status: 'in_progress' } }))
        exchange.event(deltaEvent('Hello ', 2))
        exchange.raw('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"TORN')
        setTimeout(() => exchange.drop(), 20)
      } else if (path === `/v1/responses/${ID}`) {
        status(exchange, 'in_progress')
      } else if (path.startsWith(`/v1/responses/${ID}?`)) {
        exchange.event(deltaEvent('Hello ', 2))
        exchange.event(deltaEvent('world', 3))
        exchange.event(completedEvent(ID, 4))
        exchange.end()
      }
    })
    try {
      const { model, spectator } = backgroundModel(server.baseURL)
      expect(await within(model.ask('fixture', { action: 'resume' }))).toBe('Hello world')

      expect(server.requests[0]?.body).toMatchObject({ background: true, stream: true })
      expect(paths(server)).toEqual([
        'POST /v1/responses',
        `GET /v1/responses/${ID}`,
        `GET /v1/responses/${ID}?stream=true&starting_after=2`,
      ])
      expect(server.requests[1]?.headers.authorization).toBe('Bearer sk-local')
      expect(spectator.notices).toContainEqual(expect.objectContaining({ kind: LlmNoticeKind.Resumed, reason: 'after:2', attempt: 0 }))
    } finally {
      await server.stop()
    }
  })

  test('after response.completed the stream closes with its upstream and is never resumed or cancelled', async () => {
    const server = await sseServer(exchange => {
      if (exchange.request.method !== 'POST') return exchange.json(500, {})
      exchange.event(createdEvent(ID, 0))
      exchange.event(deltaEvent('done', 1))
      exchange.event(completedEvent(ID, 2))
      setTimeout(() => exchange.drop(), 20)
    })
    try {
      const { model } = backgroundModel(server.baseURL)
      expect(await within(model.ask('fixture', { action: 'completed' }))).toBe('done')
      await sleep(300)
      expect(paths(server)).toEqual(['POST /v1/responses'])
    } finally {
      await server.stop()
    }
  })

  test('three failed polls are a retryable stall, never a short success — and the lost response is cancelled', async () => {
    let posts = 0
    const server = await sseServer(exchange => {
      const { method, path } = exchange.request
      if (method === 'POST' && path.endsWith('/cancel')) return exchange.json(200, { id: ID, status: 'cancelled' })
      if (method === 'POST') {
        posts += 1
        exchange.event(createdEvent(ID, 0))
        exchange.event(deltaEvent(posts === 1 ? 'partial ' : 'second try', 1))
        if (posts === 1) return void setTimeout(() => exchange.drop(), 20)
        exchange.event(completedEvent(ID, 2))
        return exchange.end()
      }
      exchange.json(503, { error: { message: 'unavailable' } })
    })
    try {
      const { model } = backgroundModel(server.baseURL, 2_000, 2)
      expect(await within(model.ask('fixture', { action: 'stall' }))).toBe('second try')

      await within((async () => { while (!paths(server).includes(`POST /v1/responses/${ID}/cancel`)) await sleep(10) })())
      expect(paths(server).filter(path => path === `GET /v1/responses/${ID}`)).toHaveLength(3)
      expect(paths(server).filter(path => path === 'POST /v1/responses')).toHaveLength(2)
    } finally {
      await server.stop()
    }
  })

  test('the stall reaches the model as a stream-stalled error', async () => {
    const server = await sseServer(exchange => {
      if (exchange.request.method === 'POST' && !exchange.request.path.endsWith('/cancel')) {
        exchange.event(createdEvent(ID, 0))
        return void setTimeout(() => exchange.drop(), 20)
      }
      exchange.json(503, {})
    })
    try {
      const { model } = backgroundModel(server.baseURL)
      const outcome = await within(model.ask('fixture', { action: 'lost' }).then(() => null, (error: unknown) => error as Error))
      const cause = (outcome as { cause?: unknown } | null)?.cause
      expect(cause).toBeInstanceOf(LlmModelError)
      expect((cause as Error).message).toEndWith('stream-stalled:background stream lost after 3 failed polls')
    } finally {
      await server.stop()
    }
  })

  test('an abort cancels the running response once, under its own signal — a finished one never', async () => {
    const helper = createOpenAiBackgroundHelper({ silenceMs: 5_000, cancelTimeoutMs: 1_000 })
    const body = JSON.stringify({ model: 'gpt-6-luna', stream: true, background: true, input: 'fixture' })
    const finishLater: (() => void)[] = []
    const server = await sseServer(exchange => {
      const { method, path } = exchange.request
      if (path.endsWith('/cancel')) return exchange.json(200, { id: ID, status: 'cancelled' })
      if (method === 'POST') {
        exchange.event(createdEvent(ID, 0))
        if (exchange.request.body?.input === 'finished') {
          exchange.event(completedEvent(ID, 1))
          return exchange.end()
        }
        finishLater.push(() => exchange.end())
      }
    })
    try {
      const running = new AbortController()
      const response = await helper.fetchFor({ background: true })!(`${server.baseURL}/responses`, {
        method: 'POST', headers: { authorization: 'Bearer sk-local', 'content-type': 'application/json' }, body, signal: running.signal,
      })
      const reader = response.body!.getReader()
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('response.created')
      running.abort()
      void reader.cancel().catch(() => {})
      await within((async () => { while (!paths(server).includes(`POST /v1/responses/${ID}/cancel`)) await sleep(10) })())
      await sleep(100)
      expect(paths(server).filter(path => path.endsWith('/cancel'))).toHaveLength(1)
      expect(server.requests.at(-1)?.headers.authorization).toBe('Bearer sk-local')

      const done = new AbortController()
      const finished = await helper.fetchFor({ background: true })!(`${server.baseURL}/responses`, {
        method: 'POST', headers: { authorization: 'Bearer sk-local' },
        body: JSON.stringify({ model: 'gpt-6-luna', stream: true, background: true, input: 'finished' }), signal: done.signal,
      })
      expect(await finished.text()).toContain('response.completed')
      done.abort()
      await sleep(100)
      expect(paths(server).filter(path => path.endsWith('/cancel'))).toHaveLength(1)
    } finally {
      for (const finish of finishLater) finish()
      await server.stop()
    }
  })

  // Regression (live): OpenAI sends a resumed stream's headers with its first record — a keepalive
  // ~30 s in — and a resume bounded by the poll's timeout was aborted before it was ever answered.
  test('a resumed stream answering later than a poll is waited for, up to the silence window', async () => {
    const server = await sseServer(async exchange => {
      const { method, path } = exchange.request
      if (method === 'POST' && !path.endsWith('/cancel')) {
        exchange.event(createdEvent(ID, 0))
        exchange.event(deltaEvent('slow ', 1))
        return void setTimeout(() => exchange.drop(), 20)
      }
      if (path === `/v1/responses/${ID}`) return status(exchange, 'in_progress')
      if (path.startsWith(`/v1/responses/${ID}?`)) {
        await sleep(400)
        exchange.event(deltaEvent('headers', 2))
        exchange.event(completedEvent(ID, 3))
        exchange.end()
      }
    })
    try {
      const { model } = backgroundModel(server.baseURL, 2_000, 1, { pollTimeoutMs: 100, silenceMs: 1_500 })
      expect(await within(model.ask('fixture', { action: 'slow-resume' }))).toBe('slow headers')
      expect(paths(server)).toEqual([
        'POST /v1/responses', `GET /v1/responses/${ID}`, `GET /v1/responses/${ID}?stream=true&starting_after=1`,
      ])
    } finally {
      await server.stop()
    }
  })

  test('a keepalive is forwarded whatever its number and never moves the resume cursor', async () => {
    const keepalive = (sequence: number): Record<string, unknown> => ({ type: 'keepalive', sequence_number: sequence })
    const server = await sseServer(async exchange => {
      const { method, path } = exchange.request
      if (method === 'POST' && !path.endsWith('/cancel')) {
        exchange.event(createdEvent(ID, 0))
        exchange.event(deltaEvent('kept ', 1))
        // The connection's own counter: 0, 1, … then one far ahead — none of them is an event number.
        for (const sequence of [0, 1, 2, 3, 4, 5, 99]) {
          await sleep(60)
          exchange.event(keepalive(sequence))
        }
        return void setTimeout(() => exchange.drop(), 20)
      }
      if (path === `/v1/responses/${ID}`) return status(exchange, 'in_progress')
      if (path.startsWith(`/v1/responses/${ID}?`)) {
        exchange.event(keepalive(0))
        exchange.event(deltaEvent('alive', 2))
        exchange.event(completedEvent(ID, 3))
        exchange.end()
      }
    })
    try {
      // Connection deadline 200 ms: only the forwarded keepalives keep the 420 ms of them alive.
      const { model } = backgroundModel(server.baseURL, 200, 1, { silenceMs: 5_000 })
      expect(await within(model.ask('fixture', { action: 'keepalive' }))).toBe('kept alive')
      expect(paths(server)).toContain(`GET /v1/responses/${ID}?stream=true&starting_after=1`)
    } finally {
      await server.stop()
    }
  })

  test('a provider-confirmed poll re-arms the connection deadline of a silent background response', async () => {
    let post: SseExchange | undefined
    const server = await sseServer(exchange => {
      const { method, path } = exchange.request
      if (method === 'POST' && !path.endsWith('/cancel')) {
        post = exchange
        return exchange.event(createdEvent(ID, 0))
      }
      if (path === `/v1/responses/${ID}`) return status(exchange, 'in_progress')
      exchange.json(500, {})
    })
    try {
      // Connection deadline 300 ms; nothing but polls for 900 ms — the stream itself stays open.
      const { model } = backgroundModel(server.baseURL, 300)
      const answer = within(model.ask('fixture', { action: 'polled' }))
      await sleep(900)
      post!.event(deltaEvent('still here', 1))
      post!.event(completedEvent(ID, 2))
      post!.end()

      expect(await answer).toBe('still here')
      expect(paths(server).filter(path => path === `GET /v1/responses/${ID}`).length).toBeGreaterThanOrEqual(3)
      // A silent but open stream is never replaced by a resumed one.
      expect(paths(server).some(path => path.includes('stream=true'))).toBe(false)
    } finally {
      await server.stop()
    }
  })

  // Measured on the official API: a resumed stream may bring keepalives only, even for a response
  // that already finished — the polls see it finish, and the stored copy owes the SDK the rest.
  test('a resumed stream that brings only keepalives: the finished response is completed from its stored copy', async () => {
    let polls = 0
    let ticker: ReturnType<typeof setInterval> | undefined
    const stored = {
      id: ID, object: 'response', model: 'gpt-6-luna', status: 'completed', created_at: 1,
      output: [{
        id: 'msg_local', type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'Hello world', annotations: [] }],
      }],
      usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
    }
    const server = await sseServer(exchange => {
      const { method, path } = exchange.request
      if (method === 'POST' && !path.endsWith('/cancel')) {
        exchange.event(createdEvent(ID, 0))
        exchange.event(responsesEvent('response.in_progress', 1, { response: { id: ID, status: 'in_progress' } }))
        exchange.event(deltaEvent('Hello ', 2))
        return void setTimeout(() => exchange.drop(), 20)
      }
      if (path === `/v1/responses/${ID}`) {
        polls += 1
        return polls === 1 ? status(exchange, 'in_progress') : exchange.json(200, stored)
      }
      if (path.startsWith(`/v1/responses/${ID}?`)) {
        let keepalives = 0
        exchange.event({ type: 'keepalive', sequence_number: keepalives++ })
        ticker = setInterval(() => exchange.event({ type: 'keepalive', sequence_number: keepalives++ }), 50)
        exchange.res.on('close', () => clearInterval(ticker))
      }
    })
    try {
      const { model, spectator } = backgroundModel(server.baseURL, 2_000, 1, { silenceMs: 300 })
      expect(await within(model.ask('fixture', { action: 'stored' }))).toBe('Hello world')

      expect(paths(server).filter(path => path === 'POST /v1/responses')).toHaveLength(1)
      expect(polls).toBe(2)
      expect(spectator.notices.filter(notice => notice.kind === LlmNoticeKind.Resumed).length).toBeGreaterThanOrEqual(1)
    } finally {
      clearInterval(ticker)
      await server.stop()
    }
  })

})
