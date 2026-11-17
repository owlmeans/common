import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { ChatOpenAI } from '@langchain/openai'
import { configureLog, logConfig } from '@owlmeans/log'
import { ModelProvider } from '@owlmeans/llm-common'
import { LlmModelError, LlmRetryExceededError, makeLlmModel } from '../src/index.js'
import type { ModelConfig } from '../src/index.js'
import { streamUtils } from '../src/utils/stream.js'
import { observerUtils } from '../src/utils/observer.js'
import type { AttemptObserver, ObserverListener } from '../src/utils/observer/types.js'
import { scriptedChain, noticeSpectator } from './scripted.js'
import { completedEvent, createdEvent, deltaEvent, sleep, sseServer, within } from './sse.js'

/**
 * Liveness: every byte an attempt's client receives keeps its CONNECTION deadline alive; a
 * PROGRESS deadline, armed once that attempt sent a request and re-armed by chunks only, ends a
 * connection that stays alive with nothing behind it. Real HTTP and SDK parsing where it matters.
 */

let level: ReturnType<typeof logConfig>['level']
beforeAll(() => { level = logConfig().level; configureLog({ level: 'silent' }) })
afterAll(() => { configureLog({ level }) })

const modelOn = (baseURL: string, config: Partial<ModelConfig>) => makeLlmModel({
  model: new ChatOpenAI({
    apiKey: 'local-liveness', model: 'gpt-6-luna', useResponsesApi: true, maxTokens: 64,
    configuration: { baseURL }, maxRetries: 0, timeout: 10_000,
    metadata: { config: { alias: 'live', provider: ModelProvider.OpenAI, model: 'gpt-6-luna', ...config } },
  }),
  purpose: { type: 'liveness-spec' }, retries: 1,
}, noticeSpectator())

const failureOf = async (call: Promise<unknown>): Promise<Error> => {
  const outcome = await within(call.then(() => null, (error: unknown) => error as Error))
  expect(outcome).toBeInstanceOf(LlmRetryExceededError)
  return (outcome as LlmRetryExceededError).cause as Error
}

/** An observer the spec drives by hand: `received` without `fetched` is what a request-less attempt never sees. */
const handObserver = (): AttemptObserver & { hear: ObserverListener, disarms: number } => {
  let listener: ObserverListener | undefined
  let fetched = false
  const observer = {
    disarms: 0,
    hear: {
      fetched: () => { fetched = true; listener?.fetched() },
      received: () => listener?.received(),
    },
    wrap: () => async () => new Response(null),
    resumed: () => {},
    fetched: () => fetched,
    listen: (next: ObserverListener) => { listener = next },
    disarm: () => { observer.disarms += 1; listener = undefined },
  }

  return observer
}

const collect = async (stream: AsyncGenerator<unknown>): Promise<unknown[]> => {
  const out: unknown[] = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

describe('@owlmeans/llm — connection and progress deadlines', () => {
  test('keepalive bytes keep the connection alive; with no content the progress deadline ends the attempt', async () => {
    let ticker: ReturnType<typeof setInterval> | undefined
    const server = await sseServer(exchange => {
      exchange.event(createdEvent('resp_keepalive'))
      ticker = setInterval(() => exchange.raw(': keepalive\n\n'), 40)
    })
    try {
      const startedAt = performance.now()
      const cause = await failureOf(modelOn(server.baseURL, { streamTimeout: 150, progressTimeout: 500 })
        .ask('Liveness fixture', { action: 'keepalive-only' }))

      expect(cause).toBeInstanceOf(LlmModelError)
      expect(cause.message).toEndWith('stream-stalled:no content for 500ms (progress deadline)')
      // Three connection windows passed on keepalives alone.
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(450)
    } finally {
      clearInterval(ticker)
      await server.stop()
    }
  })

  test('two attempts in flight hear only their own bytes', async () => {
    const server = await sseServer(async exchange => {
      const input = JSON.stringify(exchange.request.body?.input ?? '')
      exchange.event(createdEvent('resp_pair'))
      if (input.includes('quiet')) return // headers and one event, then nothing at all
      for (let tick = 0; tick < 12; tick++) {
        await sleep(40)
        exchange.raw(': keepalive\n\n')
      }
      exchange.event(deltaEvent('kept alive', 1))
      exchange.event(completedEvent('resp_pair', 2))
      exchange.end()
    })
    try {
      const model = modelOn(server.baseURL, { streamTimeout: 200, progressTimeout: 5_000 })
      const [busy, quiet] = await Promise.all([
        within(model.ask('busy fixture', { action: 'busy' })),
        failureOf(model.ask('quiet fixture', { action: 'quiet' })),
      ])

      expect(busy).toBe('kept alive')
      // The busy call's keepalives never reached the quiet one's connection deadline.
      expect(quiet.message).toEndWith('stream-stalled:no token for 200ms (idle deadline)')
    } finally {
      await server.stop()
    }
  })

  test('every attempt is handed its own observer; a plugin that never fetches arms no progress deadline', async () => {
    const chain = scriptedChain(['', 'answer'])
    const model = makeLlmModel({ model: chain.model, purpose: { type: 'liveness-spec' }, retries: 2 }, noticeSpectator())
    expect(await model.ask('Answer', { action: 'delegated' })).toBe('answer')

    const [first, second] = chain.refines.map(call => call.observe as AttemptObserver)
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(first).not.toBe(second)
    expect(first!.fetched()).toBe(false)

    // Bytes with no request behind them: only the connection deadline exists, and they keep it alive.
    const observer = handObserver()
    const out = await collect(streamUtils.streamWithDeadline(async () => ({
      async *[Symbol.asyncIterator]() {
        for (let tick = 0; tick < 8; tick++) {
          await sleep(40)
          observer.hear.received()
        }
        yield { content: 'late but fine' }
      },
    }), 120, undefined, { observer, progressMs: 100 }))
    expect(out).toEqual([{ content: 'late but fine' }])
  })

  test('once a request left, the same bytes no longer save it', async () => {
    const observer = handObserver()
    const run = collect(streamUtils.streamWithDeadline(async () => {
      observer.hear.fetched()
      return {
        async *[Symbol.asyncIterator]() {
          for (let tick = 0; tick < 20; tick++) {
            await sleep(40)
            observer.hear.received()
          }
          yield { content: 'too late' }
        },
      }
    }, 120, undefined, { observer, progressMs: 100 }))

    await expect(within(run)).rejects.toThrow('stream-stalled:no content for 120ms (progress deadline)')
  })

  test('the drain and late bytes re-arm nothing: the observer is disarmed at the finish and at the end', async () => {
    const observer = handObserver()
    let disarmedAtDrain = -1
    const final = { response_metadata: { finish_reason: 'stop' } }
    const out = await collect(streamUtils.streamWithDeadline(async () => {
      observer.hear.fetched()
      return {
        async *[Symbol.asyncIterator]() {
          yield { content: 'answer' }
          yield final
          disarmedAtDrain = observer.disarms
          observer.hear.received()
          await sleep(200)
        },
      }
    }, 100, { reads: 8, windowMs: 50 }, { observer, progressMs: 100 }))

    expect(out).toEqual([{ content: 'answer' }, final])
    expect(disarmedAtDrain).toBe(1)
    expect(observer.disarms).toBe(2)
    // Nothing armed by the late byte fires after the call.
    await sleep(200)

    // The real observer: once disarmed, a body it wrapped passes bytes on without reporting them.
    const real = observerUtils.of()
    const heard: string[] = []
    real.listen({ fetched: () => heard.push('fetched'), received: () => heard.push('received') })
    const body = new ReadableStream<Uint8Array>({ start: controller => { controller.enqueue(new Uint8Array([1])); controller.close() } })
    const response = await real.wrap(async () => new Response(body))('http://local.test')
    real.disarm()
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1]))
    expect(heard).toEqual(['fetched'])
  })
})
