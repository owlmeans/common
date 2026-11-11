import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import type { AddressInfo } from 'node:net'
import { appendApiClient } from '@owlmeans/api'
import { GUARD_ED25519, signBasicEd25519Request } from '@owlmeans/auth-common'
import type { TrustedRecord } from '@owlmeans/auth-common'
import { bind as bindClient } from '@owlmeans/client-entrypoint'
import { AppType } from '@owlmeans/context'
import { contract, protocol, schema, typed } from '@owlmeans/entrypoint'
import type { BinaryBody } from '@owlmeans/entrypoint'
import { backend, DEFAULT_STREAM_TYPE, route, RouteMethod, streamBody } from '@owlmeans/route'
import { appendApiServer, handlers, streamedBody } from '@owlmeans/server-api'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { bind } from '@owlmeans/server-entrypoint'
import { makeFixtureKeyPair } from '@owlmeans/test-auth'

const SERVER = 'server-auth-signed-stream'
const CALLER = 'server-auth-signed-caller'

interface Received { bytes: number, sha256: string, userId?: string }

const upload = protocol(
  route('server-auth-signed:upload', '/signed/:name', backend({
    method: RouteMethod.PUT, protocolOptions: streamBody({ maxBytes: 1024 * 1024 }),
  })),
  contract.request({
    params: typed<{ name: string }>(schema<{ name: string }>({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] })),
    body: typed<BinaryBody>(),
  }, typed<Received>()),
  { guards: GUARD_ED25519 },
)

const key = makeFixtureKeyPair('server-auth-signed-stream')
const record: TrustedRecord = {
  id: key.exportAddress(), name: CALLER, credential: key.exportPublic(), secret: key.export(), scopes: ['*'],
}
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/**
 * A streamed-body route behind `GUARD_ED25519` over a real socket: a server context (`server-context`
 * registers the guard) holding the caller's PUBLIC key, and a caller context holding the private key
 * and calling through its client binding (the guard's client half signs, `authMiddleware` stamps). The
 * bytes are not covered by the signature — raw bytes sign as `{}` on both halves.
 */
describe('@owlmeans/server-auth — GUARD_ED25519 over a streamed request body', () => {
  let close: (() => Promise<unknown>) | undefined
  let base: string
  let caller: ServerContext<ServerConfig>
  let handled = 0

  beforeAll(async () => {
    const context = makeServerContext(config<ServerConfig>(SERVER, {
      services: { [SERVER]: { service: SERVER, type: AppType.Backend, host: '127.0.0.1', default: true } },
      trusted: [{ id: record.id, name: record.name, credential: record.credential, scopes: ['*'] }],
    } as Partial<ServerConfig>)) as ServerContext<ServerConfig>
    const served = appendApiServer(context)
    const api = handlers<ServerContext<ServerConfig>>()
    context.registerEntrypoint(bind(upload, api.request(upload, async request => {
      handled += 1
      const chunks: Buffer[] = []
      for await (const chunk of streamedBody(request).stream) chunks.push(Buffer.from(chunk as Uint8Array))
      const bytes = Buffer.concat(chunks)

      return { bytes: bytes.length, sha256: sha256(bytes), ...(request.auth?.userId != null ? { userId: request.auth.userId } : {}) }
    })))
    context.configure()
    await context.init()
    const server = served.getApiServer().server
    close = async () => await server.close()
    await server.listen({ port: 0, host: '127.0.0.1' })
    const port = (server.server.address() as AddressInfo).port
    base = `http://127.0.0.1:${port}`

    caller = makeServerContext(config<ServerConfig>(CALLER, {
      services: { [SERVER]: { service: SERVER, type: AppType.Backend, host: '127.0.0.1', port, default: true } },
      security: { unsecure: true },
      trusted: [record],
    } as Partial<ServerConfig>)) as ServerContext<ServerConfig>
    appendApiClient(caller)
    caller.registerEntrypoint(bindClient(upload))
    caller.configure()
    await caller.init()
  })

  afterAll(async () => {
    await close?.()
  })

  test('a Node stream and a typed array, signed by the caller\'s binding, pass the guard whole', async () => {
    const bytes = new TextEncoder().encode('streamed through a signed call\n'.repeat(2000))

    const streamed = await caller.entrypoint(upload).call({ params: { name: 'stream' }, body: Readable.from([Buffer.from(bytes)]) })
    const viewed = await caller.entrypoint(upload).call({ params: { name: 'view' }, body: bytes })

    for (const received of [streamed, viewed]) {
      expect(received).toEqual({ bytes: bytes.length, sha256: sha256(bytes), userId: record.id })
    }
  })

  test('a request signed outside a context (`signBasicEd25519Request` over the bytes) is accepted', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const signed = await signBasicEd25519Request({ body: bytes, credential: record.id, key })

    const reply = await fetch(`${base}/signed/raw`, {
      method: 'PUT', body: bytes,
      headers: { ...signed.headers, authorization: signed.authorization, 'content-type': DEFAULT_STREAM_TYPE },
    })

    expect(reply.status).toBe(200)
    expect(await reply.json()).toEqual({ bytes: 5, sha256: sha256(bytes), userId: record.id })
  })

  test('a tampered signature is refused before the handler reads anything', async () => {
    const before = handled
    const bytes = new Uint8Array([9, 8, 7])
    const signed = await signBasicEd25519Request({ body: bytes, credential: record.id, key })
    const signature = signed.authorization.split('Signature=')[1]!
    const flipped = `${signature.slice(0, 10)}${signature[10] === 'A' ? 'B' : 'A'}${signature.slice(11)}`

    const reply = await fetch(`${base}/signed/tampered`, {
      method: 'PUT', body: bytes,
      headers: {
        ...signed.headers, authorization: signed.authorization.replace(signature, flipped), 'content-type': DEFAULT_STREAM_TYPE,
      },
    })

    expect(reply.status).toBe(401)
    expect(handled).toBe(before)
  })
})
