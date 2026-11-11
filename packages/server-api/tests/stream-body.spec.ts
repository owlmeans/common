import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHash, randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import type { AddressInfo } from 'node:net'
import { appendApiClient, apiStatusHelper } from '@owlmeans/api'
import { authMiddleware } from '@owlmeans/auth-common'
import { makeClientContext } from '@owlmeans/client-context'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { bind as bindClient } from '@owlmeans/client-entrypoint'
import { AppType } from '@owlmeans/context'
import { contract, protocol, schema, typed } from '@owlmeans/entrypoint'
import type { BinaryBody, TransferProgress } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod, streamBody } from '@owlmeans/route'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { bind } from '@owlmeans/server-entrypoint'
import { makeMockGuard, USER } from '@owlmeans/test-auth'
import type { FastifyInstance } from 'fastify'
import { handlers } from '../src/protocol.js'
import { appendApiServer } from '../src/server.js'
import { streamedBody } from '../src/stream.js'
import { StreamBodyAbortedError, StreamBodyTooLargeError } from '../src/errors.js'

const MiB = 1024 * 1024
const GUARD = 'server-api-stream-guard'
const SLOW_GUARD = 'server-api-stream-slow-guard'
const TOKEN = 'Bearer server-api-stream'

interface Received { bytes: number, sha256: string, length?: number, type?: string }

const streamed = (alias: string, path: string, maxBytes: number, opts: { types?: string[], guards?: string } = {}) => protocol(
  route(`server-api-stream:${alias}`, path, backend({
    method: RouteMethod.PUT, protocolOptions: streamBody({ maxBytes, ...(opts.types != null ? { types: opts.types } : {}) }),
  })),
  contract.request({
    params: typed<{ name: string }>(schema<{ name: string }>({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] })),
    body: typed<BinaryBody>(),
  }, typed<Received>()),
  opts.guards != null ? { guards: opts.guards } : undefined,
)

const streams = {
  upload: streamed('upload', '/stream/upload/:name', 13 * MiB),
  small: streamed('small', '/stream/small/:name', MiB),
  pdf: streamed('pdf', '/stream/pdf/:name', MiB, { types: ['application/pdf'] }),
  guarded: streamed('guarded', '/stream/guarded/:name', MiB, { guards: GUARD }),
  slow: streamed('slow', '/stream/slow/:name', 8 * MiB, { guards: SLOW_GUARD }),
}

const plain = {
  json: protocol(
    route('server-api-stream:json', '/plain/json', backend(null, RouteMethod.POST)),
    contract(schema<{ a: number }>({ type: 'object', properties: { a: { type: 'number' } }, required: ['a'] }), typed<{ a: number }>()),
  ),
  form: protocol(
    route('server-api-stream:form', '/plain/form', backend(null, RouteMethod.POST)),
    contract(typed<Record<string, unknown>>(), typed<Record<string, unknown>>()),
  ),
  raw: protocol(
    route('server-api-stream:raw', '/plain/raw', backend(null, RouteMethod.POST)),
    contract(typed<Record<string, unknown>>(), typed<{ raw: string }>()),
  ),
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** A Node stream of `total` bytes in `chunk`-sized pieces, without a known length (sent chunked). */
const chunked = (total: number, chunk: number, pause = 0, onChunk?: (sent: number) => void): Readable =>
  Readable.from((async function * () {
    for (let sent = 0; sent < total; sent += chunk) {
      yield Buffer.alloc(Math.min(chunk, total - sent), sent % 251)
      onChunk?.(sent + chunk)
      if (pause > 0) await new Promise(resolve => setTimeout(resolve, pause))
    }
  })(), { objectMode: false })

const until = async (check: () => boolean, ms = 5000): Promise<void> => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not reached')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

/**
 * A streamed body over a real socket: the package's own server (`appendApiServer`) and a client
 * context calling it through `@owlmeans/client-entrypoint` and `@owlmeans/api` from Bun, as a
 * service forwarding an upload does. The guard is `@owlmeans/test-auth`'s.
 */
describe('@owlmeans/server-api — a streamed request body', () => {
  let server: FastifyInstance
  let base: string
  let client: ClientContext<ClientConfig>
  const failures: Error[] = []
  const buffered: boolean[] = []
  const signedIn: { alias: string, token?: string } = { alias: GUARD }
  let handled = 0

  beforeAll(async () => {
    const service = 'server-api-stream-tests'
    const context = makeServerContext(config<ServerConfig>(service, {
      services: { [service]: { service, type: AppType.Backend, host: '127.0.0.1', default: true } },
    } as Partial<ServerConfig>)) as ServerContext<ServerConfig>
    const served = appendApiServer(context)
    context.registerService(makeMockGuard({ alias: GUARD, auth: USER, allow: request => request.headers?.authorization === TOKEN }))
    // A guard that takes its time: the client can be gone before the handler opens the body.
    context.registerService(makeMockGuard({
      alias: SLOW_GUARD, auth: USER, allow: async () => { await new Promise(resolve => setTimeout(resolve, 300)); return true },
    }))

    const api = handlers<ServerContext<ServerConfig>>()
    for (const declaration of Object.values(streams)) {
      context.registerEntrypoint(bind(declaration, api.request(declaration, async request => {
        handled += 1
        // Nothing buffered a copy of the body before the handler: `fastify-raw-body` is off here.
        buffered.push((request.original as { rawBody?: unknown }).rawBody != null)
        const { stream, length, type } = streamedBody(request)
        const hash = createHash('sha256')
        let bytes = 0
        try {
          for await (const chunk of stream) {
            hash.update(chunk as Buffer)
            bytes += (chunk as Buffer).length
          }
        } catch (error) {
          failures.push(error as Error)
          throw error
        }
        return { bytes, sha256: hash.digest('hex'), ...(length != null ? { length } : {}), ...(type != null ? { type } : {}) }
      })))
    }
    context.registerEntrypoint(bind(plain.json, api.body(plain.json, async body => body)))
    context.registerEntrypoint(bind(plain.form, api.body(plain.form, async body => body)))
    context.registerEntrypoint(bind(plain.raw, api.request(plain.raw, async request => ({
      raw: String((request.original as { rawBody?: string }).rawBody),
    }))))
    context.configure()
    await context.init()
    server = served.getApiServer().server
    await server.listen({ port: 0, host: '127.0.0.1' })
    const port = (server.server.address() as AddressInfo).port
    base = `http://127.0.0.1:${port}`

    client = makeClientContext({
      service: 'server-api-stream-client', type: AppType.Backend, layer: undefined, ready: false,
      services: { [service]: { service, type: AppType.Backend, host: '127.0.0.1', port, default: true } },
      security: { unsecure: true },
    } as unknown as ClientConfig) as ClientContext<ClientConfig>
    appendApiClient(client)
    // The browser's side of the guard: `authMiddleware` stamps whatever token it answers.
    client.registerService(makeMockGuard(signedIn))
    client.registerService(makeMockGuard({ alias: SLOW_GUARD }))
    client.registerMiddleware(authMiddleware)
    for (const declaration of [...Object.values(streams), ...Object.values(plain)]) {
      client.registerEntrypoint(bindClient(declaration, { validateOnCall: true }))
    }
    client.configure()
    await client.init()
  })

  afterAll(async () => { await server?.close() })

  test('a 12 MiB upload streams through a client entrypoint with progress, its checksum verified by the handler', async () => {
    const bytes = randomBytes(12 * MiB)
    const progress: TransferProgress[] = []
    const received = await client.entrypoint(streams.upload).call({
      params: { name: 'large.bin' }, body: bytes, onUploadProgress: event => { progress.push(event) },
    })

    expect(received).toEqual({ bytes: bytes.length, sha256: sha256(bytes), length: bytes.length, type: 'application/octet-stream' })
    expect(buffered.at(-1)).toBe(false)
    expect(progress.length).toBeGreaterThan(0)
    expect(progress.at(-1)).toMatchObject({ loaded: bytes.length, total: bytes.length })
  })

  test('a Blob, a typed-array view and a chunked Node stream arrive as exactly their own bytes', async () => {
    const bytes = randomBytes(256 * 1024)
    const blob = await client.entrypoint(streams.upload).call({ params: { name: 'blob' }, body: new Blob([bytes], { type: 'image/png' }) })
    expect(blob).toMatchObject({ bytes: bytes.length, sha256: sha256(bytes), type: 'application/octet-stream' })

    const view = bytes.subarray(1000, 5000)
    expect(await client.entrypoint(streams.upload).call({ params: { name: 'view' }, body: new Uint8Array(view).subarray(10, 3000) }))
      .toMatchObject({ bytes: 2990, sha256: sha256(view.subarray(10, 3000)) })

    const stream = await client.entrypoint(streams.upload).call({ params: { name: 'stream' }, body: chunked(300 * 1024, 64 * 1024) })
    expect(stream.bytes).toBe(300 * 1024)
    expect(stream.length).toBeUndefined()

    // A route declaring its own types: a call naming none is sent as the first of them.
    expect(await client.entrypoint(streams.pdf).call({ params: { name: 'doc.pdf' }, body: bytes.subarray(0, 10) }))
      .toMatchObject({ bytes: 10, type: 'application/pdf' })
  })

  test('a declared length over the limit answers 413 before the handler runs', async () => {
    const before = handled
    const error = await client.entrypoint(streams.small).call({ params: { name: 'big' }, body: Buffer.alloc(2 * MiB, 1) })
      .catch((e: unknown) => e)

    expect(apiStatusHelper.httpStatusOf(error)).toBe(413)
    expect(handled).toBe(before)
  })

  test('a chunked body crossing the limit answers 413 and the handler\'s stream errors', async () => {
    failures.length = 0
    const error = await client.entrypoint(streams.small).call({ params: { name: 'chunked' }, body: chunked(3 * MiB, 64 * 1024) })
      .catch((e: unknown) => e)

    expect(apiStatusHelper.httpStatusOf(error)).toBe(413)
    expect(failures.some(failure => failure instanceof StreamBodyTooLargeError)).toBe(true)
  })

  test('a content type the route does not declare answers 415', async () => {
    const before = handled
    for (const type of ['application/json', 'text/plain', 'image/png']) {
      const refused = await fetch(`${base}/stream/upload/typed`, { method: 'PUT', body: '{"a":1}', headers: { 'content-type': type } })
      expect(refused.status).toBe(415)
    }
    expect(handled).toBe(before)
  })

  test('a guarded streamed route refuses an unauthenticated upload with 401 and admits one the auth middleware signs', async () => {
    const before = handled
    signedIn.token = undefined
    const refused = await client.entrypoint(streams.guarded).call({ params: { name: 'anon' }, body: Buffer.alloc(512 * 1024, 2) })
      .catch((e: unknown) => e)
    expect(apiStatusHelper.httpStatusOf(refused)).toBe(401)
    expect(handled).toBe(before)

    // An answer given before the body was read never leaves the connection to be reused.
    const unread = await fetch(`${base}/stream/guarded/raw`, {
      method: 'PUT', body: Buffer.alloc(256 * 1024, 3), headers: { 'content-type': 'application/octet-stream' },
    })
    expect(unread.status).toBe(401)
    expect(unread.headers.get('connection')).toBe('close')

    signedIn.token = TOKEN
    const bytes = randomBytes(1000)
    expect(await client.entrypoint(streams.guarded).call({ params: { name: 'auth' }, body: bytes }))
      .toMatchObject({ bytes: 1000, sha256: sha256(bytes) })
  })

  test('a client abort mid-upload errors the handler\'s stream and the server answers the next request', async () => {
    failures.length = 0
    const abort = new AbortController()
    const call = client.entrypoint(streams.upload).call({
      params: { name: 'aborted' }, signal: abort.signal,
      body: chunked(4 * MiB, 32 * 1024, 20, sent => { if (sent >= 256 * 1024) abort.abort() }),
    })

    await expect(call).rejects.toBeDefined()
    await until(() => failures.some(failure => failure instanceof StreamBodyAbortedError))

    const bytes = randomBytes(64)
    expect(await client.entrypoint(streams.upload).call({ params: { name: 'after' }, body: bytes }))
      .toMatchObject({ bytes: 64, sha256: sha256(bytes) })
    const read = await fetch(`${base}/stream/upload/read`, { method: 'PUT', body: bytes, headers: { 'content-type': 'application/octet-stream' } })
    expect(read.status).toBe(200)
    expect(read.headers.get('connection')).not.toBe('close')
  })

  test('a client gone while the guard ran errors the stream the handler opens afterwards — nothing hangs', async () => {
    failures.length = 0
    const abort = new AbortController()
    const call = client.entrypoint(streams.slow).call({
      params: { name: 'early' }, signal: abort.signal,
      body: chunked(4 * MiB, 32 * 1024, 10, sent => { if (sent >= 64 * 1024) abort.abort() }),
    })

    await expect(call).rejects.toBeDefined()
    await until(() => failures.some(failure => failure instanceof StreamBodyAbortedError))
  })

  test('JSON, multipart, urlencoded and rawBody routes answer exactly as before', async () => {
    expect(await client.entrypoint(plain.json).call({ body: { a: 1 } })).toEqual({ a: 1 })
    const invalid = await fetch(`${base}/plain/json`, { method: 'POST', body: '{"a":"x"}', headers: { 'content-type': 'application/json' } })
    expect(invalid.status).toBe(400)

    const form = new FormData()
    form.append('field', 'value')
    const multipart = await fetch(`${base}/plain/form`, { method: 'POST', body: form })
    expect(multipart.status).toBe(200)
    expect(await multipart.json()).toEqual({ field: 'value' })

    // The entrypoint routes declare urlencoded without anything parsing it — unchanged.
    const urlencoded = await fetch(`${base}/plain/form`, {
      method: 'POST', body: 'field=value', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(urlencoded.status).toBe(415)

    const text = '{"marker":  "raw-body-kept"}'
    const raw = await fetch(`${base}/plain/raw`, { method: 'POST', body: text, headers: { 'content-type': 'application/json' } })
    expect(await raw.json()).toEqual({ raw: text })
  })
})
