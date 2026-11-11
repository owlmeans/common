import { DEFAULT_STREAM_TYPE, RouteProtocols, STREAM_BODY } from './consts.js'
import type { RouteDeclaration, StreamBody, StreamBodyDeclaration, StreamBodyOptions } from './types.js'

const assertMaxBytes = (maxBytes: unknown, where: string): number => {
  if (typeof maxBytes !== 'number' || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new SyntaxError(`${where}: a streamed body needs maxBytes as a positive integer, got ${String(maxBytes)}`)
  }

  return maxBytes
}

const typesOf = (types: unknown, where: string): readonly string[] => {
  if (types == null) {
    return Object.freeze([DEFAULT_STREAM_TYPE])
  }
  if (!Array.isArray(types) || types.length === 0
    || types.some(type => typeof type !== 'string' || type.trim() === '')) {
    throw new SyntaxError(`${where}: a streamed body's types must be a non-empty list of content types`)
  }

  return Object.freeze(types.map(type => (type as string).trim().toLowerCase()))
}

/**
 * Declare an HTTP route's body as a raw stream — put the result in the route's `protocolOptions`:
 *
 *     route(alias, '/:id/file', backend({ method: RouteMethod.PUT, protocolOptions: streamBody({ maxBytes }) }))
 *
 * A declaration-builder: it validates eagerly, so a mis-declared route fails where it is declared.
 */
export const streamBody = (options: StreamBodyOptions): StreamBodyDeclaration => Object.freeze({
  body: STREAM_BODY,
  maxBytes: assertMaxBytes(options.maxBytes, 'streamBody'),
  ...(options.types == null ? {} : { types: typesOf(options.types, 'streamBody') }),
})

/**
 * The streamed body an HTTP route declares, or `null` for every other route — a JSON route, a
 * socket or a package-owned transport. Read by the transports (`@owlmeans/server-api`,
 * `@owlmeans/api`, `@owlmeans/client-entrypoint`); a declaration written without `streamBody()` is
 * validated here and throws `SyntaxError` when malformed.
 */
export const streamBodyOf = (route: Pick<RouteDeclaration, 'alias' | 'protocol' | 'protocolOptions'>): StreamBody | null => {
  if (route.protocol != null && route.protocol !== RouteProtocols.WEB) {
    return null
  }
  const options = route.protocolOptions as Partial<StreamBodyDeclaration> | null | undefined
  if (options == null || typeof options !== 'object' || options.body !== STREAM_BODY) {
    return null
  }

  return {
    maxBytes: assertMaxBytes(options.maxBytes, route.alias),
    types: typesOf(options.types, route.alias),
  }
}
