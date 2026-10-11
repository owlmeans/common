import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { AppType } from '@owlmeans/context'
import { contract, protocol, schema, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { bind } from '@owlmeans/server-entrypoint'
import type { FastifyInstance } from 'fastify'
import { handlers } from '../src/protocol.js'
import { appendApiServer } from '../src/server.js'

interface Echo { value: unknown, type: string }

const echoOf = <T>(alias: string, body: ReturnType<typeof schema<T>>) => protocol(
  route(`server-api-test:${alias}`, `/echo/${alias}`, backend(null, RouteMethod.POST)),
  contract(body, typed<Echo>()),
)

const text = echoOf('text', schema<string>({ type: 'string' }))
const count = echoOf('count', schema<number>({ type: 'number' }))
const flag = echoOf('flag', schema<boolean>({ type: 'boolean' }))
const record = echoOf('record', schema<{ a: number }>({ type: 'object', properties: { a: { type: 'number' } }, required: ['a'] }))

/**
 * A scalar JSON body through the package's own server — `appendApiServer`, its Fastify instance,
 * its body validation and a protocol-bound handler — exactly as `@owlmeans/api` now sends it:
 * JSON text. The client half of the round trip is `@owlmeans/api`'s `body.spec.ts`.
 */
describe('@owlmeans/server-api — a scalar JSON body', () => {
  let server: FastifyInstance
  let context: ServerContext<ServerConfig>

  beforeAll(async () => {
    const service = 'server-api-tests'
    context = makeServerContext(config<ServerConfig>(service, {
      services: { [service]: { service, type: AppType.Backend, host: '127.0.0.1', default: true } },
    } as Partial<ServerConfig>)) as ServerContext<ServerConfig>
    const served = appendApiServer(context)
    const api = handlers<ServerContext<ServerConfig>>()
    for (const echo of [text, count, flag, record]) {
      context.registerEntrypoint(bind(echo, api.request(echo, async request => ({ value: request.body, type: typeof request.body }))))
    }
    context.configure()
    await context.init()
    server = served.getApiServer().server
    await server.ready()
  })

  afterAll(async () => { await server?.close() })

  const post = async (alias: string, payload: string, type: string = 'application/json') =>
    await server.inject({ method: 'POST', url: `/echo/${alias}`, headers: { 'content-type': type }, payload })

  const echoed = async (alias: string, payload: string): Promise<Echo> => (await post(alias, payload)).json<Echo>()

  test('a JSON string, number or boolean reaches the handler as that value', async () => {
    expect(await echoed('text', '"abc"')).toEqual({ value: 'abc', type: 'string' })
    expect(await echoed('text', '""')).toEqual({ value: '', type: 'string' })
    expect(await echoed('text', '"123"')).toEqual({ value: '123', type: 'string' })
    expect(await echoed('count', '42')).toEqual({ value: 42, type: 'number' })
    expect(await echoed('flag', 'false')).toEqual({ value: false, type: 'boolean' })
  })

  test('an object body is unchanged', async () => {
    expect(await echoed('record', '{"a":1}')).toEqual({ value: { a: 1 }, type: 'object' })
  })

  test('an unquoted string or an empty JSON body is refused with 400 — what the client no longer sends', async () => {
    expect((await post('text', 'abc')).statusCode).toBe(400)
    expect((await post('text', '')).statusCode).toBe(400)
  })
})
