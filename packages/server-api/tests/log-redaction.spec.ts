import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { AppType } from '@owlmeans/context'
import { addLogPlugin, configureLog, logStateHelper, memoryPlugin, resetLog } from '@owlmeans/log'
import type { LogRecord, NativeConsole } from '@owlmeans/log'
import { contract, protocol, schema, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { bind } from '@owlmeans/server-entrypoint'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { handlers } from '../src/protocol.js'
import { appendApiServer } from '../src/server.js'
import { fastifyLogUtils } from '../src/utils/log.js'

/** What a caller sent; none of it may reach a log record or a written line. */
const MARKER = 'pii-marker-7f3a'
const SECRETS = ['auth-secret-91c2', 'cookie-secret-44d0', 'query-secret-0b5e']

interface Inquiry { email: string, message: string }

const inquiry = protocol(
  route('server-api-test:inquiry', '/inquiry', backend(null, RouteMethod.POST)),
  contract(schema<Inquiry>({
    type: 'object',
    properties: { email: { type: 'string', format: 'email' }, message: { type: 'string', maxLength: 10 } },
    required: ['email', 'message'],
  }), typed<{ ok: boolean }>()),
)

const memory = memoryPlugin('redaction')
const written: string[] = []
const saved: Partial<NativeConsole> = {}

/** Every record as a plugin receives it, plus the error's own text: the sink writes no more than that. */
const recorded = (records: LogRecord[]): string => JSON.stringify(records.map(record => ({
  ...record, error: record.error != null ? { message: record.error.message, stack: record.error.stack } : undefined,
})))

const leaks = (): string[] => {
  const everything = `${recorded(memory.records)}\n${written.join('\n')}`
  return [MARKER, ...SECRETS].filter(secret => everything.includes(secret))
}

beforeEach(() => {
  memory.clear()
  written.length = 0
  addLogPlugin(memory)
  configureLog({ level: 'debug', console: 'native' })
  // The sink itself: read what it writes, through the captured natives it writes with.
  const native = logStateHelper.nativeConsole()
  for (const method of ['debug', 'info', 'warn', 'error'] as const) {
    saved[method] = native[method]
    native[method] = (...args: unknown[]) => { written.push(args.map(String).join(' ')) }
  }
})

afterEach(() => {
  Object.assign(logStateHelper.nativeConsole(), saved)
  resetLog()
})

describe('@owlmeans/server-api — a request never reaches the log', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    const service = 'server-api-redaction'
    const context = makeServerContext(config<ServerConfig>(service, {
      services: { [service]: { service, type: AppType.Backend, host: '127.0.0.1', default: true } },
    } as Partial<ServerConfig>)) as ServerContext<ServerConfig>
    const served = appendApiServer(context)
    const api = handlers<ServerContext<ServerConfig>>()
    context.registerEntrypoint(bind(inquiry, api.request(inquiry, async () => ({ ok: true }))))
    context.configure()
    await context.init()
    server = served.getApiServer().server
    await server.ready()
  })

  afterAll(async () => { await server?.close() })

  const headers = {
    authorization: `Bearer ${SECRETS[0]}`, cookie: `session=${SECRETS[1]}`,
  }

  test('a JSON body the schema refuses: method, path, status, code and message only', async () => {
    const response = await server.inject({
      method: 'POST', url: `/inquiry?token=${SECRETS[2]}`,
      headers: { ...headers, 'content-type': 'application/json' },
      payload: JSON.stringify({ email: `${MARKER}@`, message: `${MARKER} wrote this` }),
    })

    expect(response.statusCode).toBe(400)
    expect(leaks()).toEqual([])
    const refused = memory.records.find(record => record.message === 'Request refused')
    expect(refused).toMatchObject({
      level: 'debug', scope: 'http',
      data: { method: 'POST', path: '/inquiry', status: 400, code: 'FST_ERR_VALIDATION' },
    })
    expect(Object.keys(refused!.data as object).sort()).toEqual(['code', 'message', 'method', 'path', 'status'])
    // Nothing about a refused request is written at info.
    expect(memory.records.filter(record => record.level !== 'debug')).toEqual([])
  })

  test('a multipart body the schema refuses: no field, no file byte', async () => {
    const boundary = 'owlmeansboundary'
    const payload = [
      `--${boundary}`, 'Content-Disposition: form-data; name="email"', '', `${MARKER}@`,
      `--${boundary}`, 'Content-Disposition: form-data; name="message"', '', `${MARKER} wrote this`,
      `--${boundary}`, 'Content-Disposition: form-data; name="file"; filename="note.txt"', 'Content-Type: text/plain', '',
      `${MARKER} file bytes`, `--${boundary}--`, '',
    ].join('\r\n')
    const response = await server.inject({
      method: 'POST', url: '/inquiry', payload,
      headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
    })

    expect(response.statusCode).toBe(400)
    expect(leaks()).toEqual([])
    expect(memory.records.some(record => record.message === 'Request refused')).toBe(true)
  })

  test('an unparsable body and a missing route: no body, no query', async () => {
    const broken = await server.inject({
      method: 'POST', url: `/inquiry?token=${SECRETS[2]}`,
      headers: { ...headers, 'content-type': 'application/json' }, payload: `{"email":"${MARKER}`,
    })
    const missing = await server.inject({ method: 'GET', url: `/nowhere?token=${SECRETS[2]}`, headers })

    expect(broken.statusCode).toBe(400)
    expect(missing.statusCode).toBe(404)
    expect(leaks()).toEqual([])
    expect(memory.records.find(record => record.message === 'Route not found')?.data)
      .toEqual({ method: 'GET', path: '/nowhere' })
  })
})

describe('@owlmeans/server-api — what the Fastify log adapter writes', () => {
  const request = {
    method: 'POST', url: `/inquiry?token=${SECRETS[2]}`, id: 'req-1',
    headers: { ...{ authorization: `Bearer ${SECRETS[0]}`, cookie: `session=${SECRETS[1]}` }, 'x-note': MARKER },
    body: { email: `${MARKER}@example.com` }, rawBody: `{"email":"${MARKER}@example.com"}`,
    query: { token: SECRETS[2] },
  }
  const reply = { statusCode: 500, request, header: () => reply }

  test('a request becomes its method and path, a reply its status, bytes their size', () => {
    const fastifyRequest = Object.assign(Object.create({ kind: 'request' }) as object, request)
    const fastifyReply = Object.assign(Object.create({ kind: 'reply' }) as object, reply)
    const log = fastifyLogUtils.logger() as unknown as Record<string, (...args: unknown[]) => void>
    log.error({ req: fastifyRequest, res: fastifyReply, err: new Error('boom') }, 'failed')
    log.info({ busboyOptions: { headers: request.headers, limits: { files: 5 } } }, 'parsing')
    log.warn({ body: request.body, rawBody: request.rawBody, file: new TextEncoder().encode(MARKER) }, 'dumped')
    log.warn({ upload: new TextEncoder().encode(MARKER), url: request.url }, `Reply was already sent in "${request.url}"`)

    expect(leaks()).toEqual([])
    expect(memory.records.map(record => record.data)).toEqual([
      { req: { method: 'POST', path: '/inquiry' }, res: { statusCode: 500 } },
      { busboyOptions: { limits: { files: 5 } } },
      {},
      { upload: `[Uint8Array ${MARKER.length} bytes]`, url: '/inquiry' },
    ])
    expect(memory.records[3].message).toBe('Reply was already sent in "/inquiry"')
  })

  test('the controller logs a request the default error handler answers by its status alone', () => {
    const controller = fastifyLogUtils.controller()
    const asRequest = request as unknown as FastifyRequest
    controller.defaultErrorLog(new Error('fault'), asRequest, { ...reply, statusCode: 500 } as unknown as FastifyReply)
    controller.defaultErrorLog(new Error('denied'), asRequest, { ...reply, statusCode: 403 } as unknown as FastifyReply)
    controller.incomingRequest(asRequest, reply as unknown as FastifyReply)
    controller.requestCompleted(null, asRequest, reply as unknown as FastifyReply)

    expect(leaks()).toEqual([])
    expect(memory.records.map(record => [record.level, record.message, record.data])).toEqual([
      ['error', 'Request failed', { method: 'POST', path: '/inquiry', status: 500 }],
      ['warn', 'Access forbidden', { message: 'denied', method: 'POST', path: '/inquiry', status: 403 }],
    ])
    expect(memory.records[0].error?.message).toBe('fault')
    expect(memory.records[1].event).toBe('access.forbidden')
  })
})
