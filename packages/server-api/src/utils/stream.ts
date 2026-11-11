import { errorCodes } from 'fastify'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { StreamBody } from '@owlmeans/route'
import { PassThrough } from 'node:stream'
import type { Readable } from 'node:stream'
import { StreamBodyAbortedError, StreamBodyTooLargeError } from '../errors.js'
import type { StreamedBody } from '../types.js'
import {
  STREAM_HIGH_WATER_MARK, STREAM_METHODS, STREAM_ROUTE_CONFIG, STREAM_SOURCE, STREAM_STATE,
} from './stream/consts.js'
import type { StreamBodyUtils, StreamCarrier, StreamRoute, StreamState } from './stream/types.js'

/** A `Content-Length` header as a number, or nothing when it is absent or not a length. */
const declaredLengthOf = (header: unknown): number | undefined => {
  const value = Array.isArray(header) ? header[0] : header
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    return undefined
  }

  return Number(value)
}

const headerOf = (header: unknown): string | undefined => {
  const value = Array.isArray(header) ? header[0] : header
  return typeof value === 'string' ? value : undefined
}

export const createStreamBodyUtils = (): StreamBodyUtils => {
  const declarationOf = (request: FastifyRequest): StreamBody | undefined =>
    (request.routeOptions?.config as unknown as Record<string, unknown> | undefined)?.[STREAM_ROUTE_CONFIG] as StreamBody | undefined

  const emptyBody = (body: StreamBody): StreamedBody => {
    const stream = new PassThrough()
    stream.end()

    return { stream, length: 0, maxBytes: body.maxBytes }
  }

  /**
   * Pump the request into the handler's stream by hand rather than through `pipeline`: past the
   * limit the request must be left alone — paused, not destroyed — so the 413 can still be written
   * on its connection.
   */
  const pump = (request: FastifyRequest, payload: Readable, body: StreamBody, state: StreamState, stream: PassThrough): void => {
    const raw = request.raw
    let received = 0
    let settled = false

    const detach = (): void => {
      payload.off('data', onData)
      payload.off('end', onEnd)
      payload.off('error', onError)
      raw.off('close', onClose)
    }
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      detach()
      payload.pause()
      state.failure = error
      stream.destroy(error)
    }
    const onData = (chunk: Buffer): void => {
      received += chunk.length
      if (received > body.maxBytes) {
        fail(new StreamBodyTooLargeError(`${body.maxBytes}`))
        return
      }
      if (!stream.write(chunk)) {
        payload.pause()
      }
    }
    const onEnd = (): void => {
      if (settled) return
      settled = true
      detach()
      stream.end()
    }
    const onError = (error: Error): void => fail(new StreamBodyAbortedError(error.message))
    // A request that closes before its body is complete was abandoned by the client; one that is
    // complete still delivers what is buffered, up to `end` — unless it was destroyed with it.
    const gone = (): boolean => raw.complete !== true || (payload.destroyed && !payload.readableEnded)
    const onClose = (): void => {
      if (gone()) fail(new StreamBodyAbortedError('closed'))
    }

    stream.on('drain', () => { if (!settled) payload.resume() })
    // The handler gave up on the stream (destroyed it): stop reading; the answer closes the connection.
    stream.on('close', () => {
      if (settled) return
      settled = true
      detach()
      payload.pause()
    })
    payload.on('data', onData)
    payload.on('end', onEnd)
    payload.on('error', onError)
    raw.on('close', onClose)
    // The client may have gone while guards and gates ran, before anything listened.
    if ((raw.destroyed || payload.destroyed) && gone()) {
      fail(new StreamBodyAbortedError('closed'))
    }
  }

  const open = (request: FastifyRequest): StreamedBody => {
    const carrier = request as FastifyRequest & StreamCarrier
    const opened = carrier[STREAM_STATE]
    if (opened != null) {
      return opened.body
    }
    const declaration = declarationOf(request)
    if (declaration == null) {
      throw new SyntaxError(`${request.method} ${request.routeOptions?.url ?? ''}: the route declares no streamed body`)
    }
    const source = carrier[STREAM_SOURCE]
    if (source == null) {
      // A request without a body never reaches the parser.
      const state: StreamState = { body: emptyBody(declaration) }
      carrier[STREAM_STATE] = state

      return state.body
    }

    const stream = new PassThrough({ highWaterMark: STREAM_HIGH_WATER_MARK })
    const state: StreamState = {
      body: {
        stream,
        maxBytes: declaration.maxBytes,
        ...(source.length != null ? { length: source.length } : {}),
        ...(source.type != null ? { type: source.type } : {}),
      },
    }
    carrier[STREAM_STATE] = state
    pump(request, source.payload, declaration, state, stream)

    return state.body
  }

  const failureOf = (request: FastifyRequest): Error | undefined =>
    (request as FastifyRequest & StreamCarrier)[STREAM_STATE]?.failure

  const register = async (server: FastifyInstance, route: StreamRoute): Promise<void> => {
    if (!STREAM_METHODS.includes(route.method)) {
      throw new SyntaxError(`${route.alias}: a streamed body needs POST, PUT or PATCH, not ${route.method.toUpperCase()}`)
    }
    const { body } = route

    await server.register(async instance => {
      // Only the declared types parse here; anything else Fastify answers 415.
      instance.removeAllContentTypeParsers()
      instance.addContentTypeParser([...body.types], (request, payload, done) => {
        const length = declaredLengthOf(request.headers['content-length'])
        if (length != null && length > body.maxBytes) {
          done(new errorCodes.FST_ERR_CTP_BODY_TOO_LARGE(), undefined)
          return
        }
        const type = headerOf(request.headers['content-type'])
        ;(request as FastifyRequest & StreamCarrier)[STREAM_SOURCE] = {
          payload: payload as Readable,
          ...(length != null ? { length } : {}),
          ...(type != null ? { type } : {}),
        }
        done(null, undefined)
      })
      // An answer sent before the body was read to its end cannot leave the connection reusable:
      // the rest of the body would be read as the next request.
      instance.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
        if (request.raw.complete !== true) {
          reply.header('connection', 'close')
        }

        return payload
      })
      instance.route({
        url: route.url,
        method: route.method,
        bodyLimit: body.maxBytes,
        // `fastify-raw-body` (registered globally with `runFirst`) would read the whole body first.
        config: { rawBody: false, [STREAM_ROUTE_CONFIG]: body } as Record<string, unknown>,
        schema: route.schema,
        handler: route.handler,
      })
    })
  }

  return { register, open, failureOf }
}

export const streamBodyUtils = createStreamBodyUtils()
