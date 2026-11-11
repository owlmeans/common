import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { FastifyRequest } from 'fastify'
import { streamBodyUtils } from './utils/stream.js'
import type { StreamedBody } from './types.js'

/**
 * The raw body of a streamed-body route (`streamBody()` of `@owlmeans/route`) — the boundary helper
 * a handler reads an upload through instead of `request.original`:
 *
 *     api.request(materialProtocols.upload, async (request, context) => {
 *       const { stream, length } = streamedBody(request)
 *       return await context.materials().receive(request.params.id, stream, length)
 *     })
 *
 * Opened on the first call (the same object afterwards). Throws `SyntaxError` for a request that did
 * not arrive over HTTP or whose route declares no streamed body.
 */
export const streamedBody = (request: AbstractRequest): StreamedBody => {
  const original = request.original as FastifyRequest | undefined
  if (original == null || typeof original !== 'object' || original.raw == null) {
    throw new SyntaxError(`${request.alias}: streamedBody() needs the request an HTTP route received`)
  }

  return streamBodyUtils.open(original)
}
