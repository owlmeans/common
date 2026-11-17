import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'

/** One request the local provider received. */
export interface SseRequest {
  method: string
  /** Path and query, as sent. */
  path: string
  headers: IncomingHttpHeaders
  /** The JSON body, or `undefined` for none. */
  body: Record<string, unknown> | undefined
}

/** One exchange in flight: the request and the means to answer it. */
export interface SseExchange {
  request: SseRequest
  res: ServerResponse
  /** Write one SSE event — `event: <type>` and its JSON data. */
  event: (value: Record<string, unknown>) => void
  /** Write raw bytes (a comment, a torn record). */
  raw: (text: string) => void
  /** Answer JSON and end. */
  json: (status: number, value: unknown) => void
  /** End the response cleanly. */
  end: () => void
  /** Drop the connection mid-stream. */
  drop: () => void
}

export interface SseServer {
  baseURL: string
  requests: SseRequest[]
  stop: () => Promise<void>
}

/** A Responses-shaped event at a sequence number. */
export const responsesEvent = (type: string, sequence: number, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ type, sequence_number: sequence, ...extra })

export const createdEvent = (id: string, sequence = 0): Record<string, unknown> => responsesEvent('response.created', sequence, {
  response: { id, object: 'response', model: 'gpt-6-luna', status: 'queued', created_at: 1, output: [] },
})

export const deltaEvent = (text: string, sequence: number): Record<string, unknown> => responsesEvent('response.output_text.delta', sequence, {
  item_id: 'msg_local', output_index: 0, content_index: 0, delta: text, logprobs: [],
})

export const completedEvent = (id: string, sequence: number): Record<string, unknown> => responsesEvent('response.completed', sequence, {
  response: {
    id, object: 'response', model: 'gpt-6-luna', status: 'completed', created_at: 1, output: [],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  },
})

/** A real HTTP server answering each request through `handle` — the remote provider, scripted. */
export const sseServer = async (handle: (exchange: SseExchange) => void | Promise<void>): Promise<SseServer> => {
  const requests: SseRequest[] = []
  const sockets = new Set<Socket>()
  const server = createServer((req, res) => {
    res.on('error', () => {})
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString()
      const request: SseRequest = {
        method: req.method ?? 'GET', path: req.url ?? '/', headers: req.headers,
        body: text !== '' ? JSON.parse(text) as Record<string, unknown> : undefined,
      }
      requests.push(request)
      const open = (): void => {
        if (!res.headersSent) {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
          res.flushHeaders()
        }
      }
      void handle({
        request, res,
        event: value => {
          open()
          res.write(`event: ${String(value.type)}\ndata: ${JSON.stringify(value)}\n\n`)
        },
        raw: text => {
          open()
          res.write(text)
        },
        json: (status, value) => {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(value))
        },
        end: () => {
          open()
          res.end()
        },
        drop: () => req.socket.destroy(),
      })
    })
  })
  server.on('connection', socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

  return {
    baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    requests,
    stop: async () => {
      await new Promise<void>(resolve => {
        server.close(() => resolve())
        for (const socket of sockets) socket.destroy()
      })
    },
  }
}

/** Resolve after `ms`. */
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** Fail a promise that does not settle within `ms` — the test's own guard, longer than any deadline under test. */
export const within = async <T>(promise: Promise<T>, ms = 5_000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`did not settle within ${ms}ms`)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
