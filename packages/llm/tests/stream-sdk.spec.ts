import { describe, expect, test } from 'bun:test'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { ChatOpenAI } from '@langchain/openai'
import type { AIMessage } from '@langchain/core/messages'
import { ModelProvider, type SpectatorArgument } from '@owlmeans/llm-common'
import { LlmModelError, LlmRetryExceededError } from '../src/errors.js'
import { makeLlmModel } from '../src/model.js'
import type { LlmModel, RefferedResult } from '../src/types.js'

interface ResponsesRequest {
  method: string | undefined
  path: string | undefined
  body: { model: string, stream: boolean, input: unknown[] }
}

interface LocalResponses {
  baseURL: string
  request: Promise<ResponsesRequest>
  disconnected: Promise<void>
  requests: () => number
  delta: (text: string) => void
  complete: () => void
  stop: () => Promise<void>
}

interface ObservedModel {
  model: LlmModel
  tokens: string[]
  traces: SpectatorArgument[]
  ref: RefferedResult<AIMessage>
  accepted: string[]
}

/** Real HTTP and SDK parsing; only the remote provider is replaced by a local fixture. */
const localResponses = async (sendHeaders: boolean): Promise<LocalResponses> => {
  let resolveRequest: (request: ResponsesRequest) => void = () => {}
  const request = new Promise<ResponsesRequest>(resolve => { resolveRequest = resolve })
  let resolveDisconnected: () => void = () => {}
  const disconnected = new Promise<void>(resolve => { resolveDisconnected = resolve })
  let response: ServerResponse | undefined
  let requests = 0
  let sequence = 0
  const sockets = new Set<Socket>()
  const server = createServer((req, res) => {
    requests += 1
    response = res
    req.socket.once('close', resolveDisconnected)
    // A deliberate late write after the client's cancellation is part of these tests.
    res.on('error', () => {})
    const body: Buffer[] = []
    req.on('data', chunk => body.push(Buffer.from(chunk)))
    req.on('end', () => {
      if (sendHeaders) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        res.flushHeaders()
      }
      resolveRequest({ method: req.method, path: req.url, body: JSON.parse(Buffer.concat(body).toString()) })
    })
  })
  server.on('connection', socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

  const event = (value: Record<string, unknown>): void => {
    if (response == null) throw new Error('Responses fixture has received no request')
    if (!response.headersSent) {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    }
    response.write(`event: ${value.type}\ndata: ${JSON.stringify({ ...value, sequence_number: sequence++ })}\n\n`)
  }

  return {
    baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    request,
    disconnected,
    requests: () => requests,
    delta: text => event({
      type: 'response.output_text.delta', item_id: 'msg_local', output_index: 0,
      content_index: 0, delta: text, logprobs: [],
    }),
    complete: () => {
      event({
        type: 'response.completed',
        response: {
          id: 'resp_local', object: 'response', model: 'gpt-6.1-sol', status: 'completed',
          created_at: 1, output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        },
      })
      response!.end()
    },
    stop: async () => {
      await new Promise<void>(resolve => {
        server.close(() => resolve())
        for (const socket of sockets) socket.destroy()
      })
    },
  }
}

const observedModel = (baseURL: string, idleMs: number): ObservedModel => {
  const tokens: string[] = []
  const traces: SpectatorArgument[] = []
  const accepted: string[] = []
  const ref: RefferedResult<AIMessage> = {}
  const model = makeLlmModel({
    model: new ChatOpenAI({
      apiKey: 'local-sdk-regression', model: 'gpt-6.1-sol', useResponsesApi: true,
      configuration: { baseURL }, maxRetries: 5, timeout: 10_000, maxTokens: 64,
      metadata: { config: { provider: ModelProvider.OpenAI, model: 'gpt-6.1-sol', streamTimeout: idleMs } },
      callbacks: [{ handleLLMNewToken: token => { tokens.push(token) } }],
    }),
    purpose: { type: 'local-sdk-regression' }, retries: 1,
  }, {
    log: async entry => {
      traces.push(entry)
      return {
        ...entry, id: 'local-trace', kind: 'general', model: 'gpt-6.1-sol',
        purpose: { type: 'local-sdk-regression' }, timestamp: Date.now(),
      }
    },
  })

  return { model, tokens, traces, accepted, ref }
}

/** The test's guard is deliberately longer than the model's independent idle deadline. */
const bounded = async <T>(promise: Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Local SDK operation did not settle within 2 seconds')), 2_000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

describe('@owlmeans/llm — Responses SDK stream cancellation over real HTTP', () => {
  for (const sendHeaders of [false, true]) {
    test(`rejects and closes a ${sendHeaders ? 'headers-open/no-SSE' : 'never-headers'} response without accepting late output`, async () => {
      const transport = await localResponses(sendHeaders)
      const observed = observedModel(transport.baseURL, 180)
      try {
        const startedAt = performance.now()
        const result = observed.model.ask('Local transport fixture only', {
          action: 'local-stalled-response', ref: observed.ref,
          filter: async text => { observed.accepted.push(text); return text },
        }).then(value => ({ value, error: undefined }), (error: unknown) => ({ value: undefined, error }))
        const request = await bounded(transport.request)
        expect(request.method).toBe('POST')
        expect(request.path).toBe('/v1/responses')
        expect(request.body.model).toBe('gpt-6.1-sol')
        expect(request.body.stream).toBe(true)
        expect(request.body.input).toHaveLength(1)

        const outcome = await bounded(result)
        expect(outcome.error).toBeInstanceOf(LlmRetryExceededError)
        expect((outcome.error as LlmRetryExceededError).cause).toBeInstanceOf(LlmModelError)
        expect(((outcome.error as LlmRetryExceededError).cause as Error).message).toContain('stream-stalled')
        expect(outcome.value).toBeUndefined()
        expect(performance.now() - startedAt).toBeLessThan(1_500)

        // Prove the client closed the network before the fixture's cleanup can do it.
        await bounded(transport.disconnected)
        expect(transport.requests()).toBe(1)
        transport.delta('late output must not be accepted')
        transport.complete()
        await new Promise<void>(resolve => setTimeout(resolve, 40))
        expect(observed.tokens).toEqual([])
        expect(observed.traces).toEqual([])
        expect(observed.accepted).toEqual([])
        expect(observed.ref.value).toBeUndefined()
        expect(observed.ref.spectatorEntry).toBeUndefined()
      } finally {
        await transport.stop()
      }
    })
  }

  test('accepts real Responses deltas that keep arriving beyond one idle window', async () => {
    const transport = await localResponses(true)
    const observed = observedModel(transport.baseURL, 250)
    try {
      const result = observed.model.ask('Local transport fixture only', {
        action: 'local-active-response', ref: observed.ref,
        filter: async text => { observed.accepted.push(text); return text },
      })
      // Attach the failure observer before driving the response, including when this regresses.
      const completed = result.then(value => ({ value, error: undefined }), (error: unknown) => ({ value: undefined, error }))
      await bounded(transport.request)
      const startedAt = performance.now()
      for (const text of ['Long ', 'active ', 'stream ', 'is ', 'valid.']) {
        transport.delta(text)
        await new Promise<void>(resolve => setTimeout(resolve, 85))
      }
      transport.complete()
      const outcome = await bounded(completed)

      expect(outcome.error).toBeUndefined()
      expect(outcome.value).toBe('Long active stream is valid.')
      expect(performance.now() - startedAt).toBeGreaterThan(250)
      expect(observed.tokens.join('')).toBe('Long active stream is valid.')
      expect(observed.accepted).toEqual(['Long active stream is valid.'])
      expect(observed.traces).toHaveLength(1)
      expect(observed.ref.value).toBeDefined()
      expect(observed.ref.spectatorEntry?.id).toBe('local-trace')
      expect(transport.requests()).toBe(1)
    } finally {
      await transport.stop()
    }
  })
})
