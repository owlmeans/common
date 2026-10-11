import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { provideResponse, type AbstractRequest } from '@owlmeans/entrypoint'
import { RouteMethod } from '@owlmeans/route'
import { createApiService } from '../src/service.js'
import { bodyUtils } from '../src/utils/body.js'

const STRING = { type: 'string' }

describe('what a request body becomes', () => {
  test('a scalar on a POST without a content type is JSON text', () => {
    expect(bodyUtils.requestBodyOf('abc', {}, RouteMethod.POST)).toEqual({ data: '"abc"', contentType: 'application/json', verbatim: true })
    expect(bodyUtils.requestBodyOf('', {}, RouteMethod.POST).data).toBe('""')
    expect(bodyUtils.requestBodyOf(5, {}, RouteMethod.POST).data).toBe('5')
    expect(bodyUtils.requestBodyOf(0, {}, RouteMethod.POST).data).toBe('0')
    expect(bodyUtils.requestBodyOf(true, {}, RouteMethod.POST).data).toBe('true')
    expect(bodyUtils.requestBodyOf(false, {}, RouteMethod.POST).data).toBe('false')
  })

  test('a scalar under an explicit JSON content type is JSON text, on any method', () => {
    expect(bodyUtils.requestBodyOf('abc', { 'Content-Type': 'application/json; charset=utf-8' }, RouteMethod.PUT))
      .toEqual({ data: '"abc"', verbatim: true })
    expect(bodyUtils.requestBodyOf(7, { 'content-type': 'application/merge-patch+json' }, RouteMethod.PATCH).data).toBe('7')
  })

  test('already-serialized JSON text is sent as it is', () => {
    expect(bodyUtils.requestBodyOf('{"a":1}', {}, RouteMethod.POST).data).toBe('{"a":1}')
    expect(bodyUtils.requestBodyOf('[1,2]', {}, RouteMethod.POST).data).toBe('[1,2]')
    expect(bodyUtils.requestBodyOf('"abc"', {}, RouteMethod.POST).data).toBe('"abc"')
    expect(bodyUtils.requestBodyOf('"abc"', {}, RouteMethod.POST, STRING).data).toBe('"abc"')
  })

  test('under a string body schema, JSON-looking text is the string the caller means', () => {
    expect(bodyUtils.jsonScalarBody('123', STRING)).toBe('"123"')
    expect(bodyUtils.jsonScalarBody('true', STRING)).toBe('"true"')
    expect(bodyUtils.jsonScalarBody('null', { type: ['string', 'null'] })).toBe('"null"')
    expect(bodyUtils.jsonScalarBody('{"a":1}', STRING)).toBe('"{\\"a\\":1}"')
    expect(bodyUtils.jsonScalarBody('123', { type: 'number' })).toBe('123')
  })

  test('objects, arrays and everything outside JSON behave as before', () => {
    const object = { a: 1 }
    expect(bodyUtils.requestBodyOf(object, {}, RouteMethod.POST)).toEqual({ data: object, verbatim: false })
    expect(bodyUtils.requestBodyOf([1], {}, RouteMethod.POST)).toEqual({ data: [1], verbatim: false })
    expect(bodyUtils.requestBodyOf(undefined, {}, RouteMethod.POST)).toEqual({ data: undefined, verbatim: false })
    expect(bodyUtils.requestBodyOf('abc', { 'content-type': 'text/plain' }, RouteMethod.POST)).toEqual({ data: 'abc', verbatim: false })
    expect(bodyUtils.requestBodyOf('abc', {}, RouteMethod.PUT)).toEqual({ data: 'abc', verbatim: false })
    expect(bodyUtils.requestBodyOf({ a: '1', b: ['x'] }, { 'content-type': 'application/x-www-form-urlencoded' }, RouteMethod.POST).data)
      .toBe('a=1&b%5B0%5D=x')
  })

  test('the content-type header is read whatever its case', () => {
    expect(bodyUtils.contentTypeOf({ 'CONTENT-TYPE': 'application/json' })).toBe('application/json')
    expect(bodyUtils.contentTypeOf({ accept: 'application/json' })).toBeUndefined()
    expect(bodyUtils.isJsonContentType('application/vnd.api+json')).toBe(true)
    expect(bodyUtils.isJsonContentType('application/jsonp')).toBe(false)
    expect(bodyUtils.isJsonContentType('text/plain')).toBe(false)
  })
})

/**
 * The real client over real HTTP: an echo server answers the bytes and the content type it
 * received, so what a Fastify JSON parser would read is exactly what is asserted here.
 */
describe('the API client on the wire', () => {
  let server: ReturnType<typeof Bun.serve>

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      fetch: async request => Response.json({ type: request.headers.get('content-type'), raw: await request.text() }),
    })
  })

  afterAll(() => { server.stop(true) })

  const send = async (
    body: unknown, opts: { method?: RouteMethod, headers?: Record<string, string>, schema?: object } = {}
  ): Promise<{ type: string | null, raw: string }> => {
    const client = createApiService('test-client')
    client.ctx = {
      cfg: { service: 'api-tests', security: { unsecure: true }, services: {} },
      entrypoint: () => ({
        alias: 'echo',
        route: { route: { method: opts.method ?? RouteMethod.POST } },
        filter: opts.schema != null ? { body: opts.schema } : undefined,
        path: () => '/echo',
        address: () => ({ host: '127.0.0.1', port: server.port, secure: false }),
      }),
      hasService: () => false,
    } as never
    const reply = provideResponse<{ type: string | null, raw: string }>()
    const request = { alias: 'echo', params: {}, query: {}, headers: opts.headers ?? {}, body, path: '/echo' } as AbstractRequest
    await client.handler(request, reply)
    if (reply.error != null) {
      throw reply.error
    }
    return reply.value!
  }

  test('a bare string, number or boolean arrives as valid JSON of the same value', async () => {
    for (const value of ['abc', '', 'a "quoted" word', 42, 0, true, false]) {
      const received = await send(value)
      expect(received.type).toStartWith('application/json')
      expect(JSON.parse(received.raw)).toEqual(value)
    }
  })

  test('a string contract carries JSON-looking text as a string', async () => {
    expect(JSON.parse((await send('123', { schema: STRING })).raw)).toBe('123')
  })

  test('objects, arrays and serialized text arrive as before', async () => {
    expect(await send({ a: 1 })).toEqual({ type: expect.stringContaining('application/json'), raw: '{"a":1}' })
    expect((await send(['x'])).raw).toBe('["x"]')
    expect((await send('{"a":1}')).raw).toBe('{"a":1}')
    expect(await send('plain', { headers: { 'content-type': 'text/plain' } })).toEqual({ type: 'text/plain', raw: 'plain' })
  })

  test('the caller\'s headers are not rewritten', async () => {
    const headers: Record<string, string> = {}
    await send('abc', { headers })
    expect(headers).toEqual({})
  })
})
