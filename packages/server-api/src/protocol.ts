import { assertContext, type BasicConfig, type BasicContext } from '@owlmeans/context'
import { EntrypointOutcome, type BodyOf, type EntrypointProtocolDeclaration, type HandlerRequest, type OpenRequest, type ParamsOf, type RequestOf, type ResponseOf, type AbstractRequest } from '@owlmeans/entrypoint'
import type { BoundEntrypointHandler } from '@owlmeans/server-entrypoint'
import { HandlerMisconfiguredError } from './errors.js'
import { logger } from '@owlmeans/log'
import type { AnyBoundHandler, BodyProtocol, ContextCarrier, HandlerResponse, MaybePromise, ParamsProtocol } from './types.local.js'


const contextFor = <Context extends BasicContext<BasicConfig>>(
  request: AbstractRequest,
  fallback: Context,
): Context => {
  const original = request.original
  if (original != null && typeof original === 'object' && '_ctx' in original) {
    return (original as ContextCarrier<Context>)._ctx ?? fallback
  }

  return fallback
}

const bind = <Protocol extends EntrypointProtocolDeclaration, Context extends BasicContext<BasicConfig>>(
  protocol: Protocol,
  execute: (request: HandlerRequest<RequestOf<Protocol>>, context: Context) => MaybePromise<HandlerResponse<ResponseOf<Protocol>>>,
): BoundEntrypointHandler<Protocol> => ({
  protocol,
  bind: ref => async (request, response) => {
    const fallback = assertContext<BasicConfig, Context>(ref.ref?.ctx, protocol.alias)

    try {
      const typedRequest = (request as HandlerRequest<OpenRequest>) as HandlerRequest<RequestOf<Protocol>>
      const value = await execute(
        typedRequest,
        contextFor(request, fallback),
      )
      response.resolve(value as ResponseOf<Protocol>, EntrypointOutcome.Ok)
    } catch (error) {
      response.reject(error as Error)
    }

    return response.value
  },
})

/**
 * `value` is shaped like a `BoundEntrypointHandler` — never a plain function, which also carries
 * its own `.bind` and would otherwise pass a `typeof value.bind === 'function'` check alone.
 */
const isBoundHandler = (value: unknown): value is AnyBoundHandler =>
  typeof value === 'object' && value != null
  && typeof (value as { bind?: unknown }).bind === 'function'
  && (value as { protocol?: unknown }).protocol != null

const warnedAliases = new Set<string>()

/**
 * What `body`/`params`/`request` do with something that is not the plain callback they declare —
 * the shape a handler module wraps its own export in when it is bound TWICE. `null` means the
 * second argument really is a callback and the caller should wrap it as usual.
 *
 * A handler bound to THIS protocol is returned unchanged, with a one-time warning: the module
 * already produced a working `BoundEntrypointHandler`, and re-wrapping it here would only wrap it
 * again — returning it as-is is what makes `bind(protocol, api.body(protocol, alreadyBound))`
 * behave exactly like `bind(protocol, alreadyBound)`, which is what a wrap-once file looks like at
 * this call site. Anything else — a handler bound to a DIFFERENT protocol, or a value that is
 * neither a function nor a bound handler at all — answers every request on this route with
 * {@link HandlerMisconfiguredError} instead of throwing `TypeError: handler is not a function`
 * out of the request pipeline's own `try`, where the type name and the alias it happened on are
 * both lost.
 */
const toleratedHandler = <Protocol extends EntrypointProtocolDeclaration>(
  protocol: Protocol, handler: unknown
): BoundEntrypointHandler<Protocol> | null => {
  if (typeof handler === 'function') return null

  if (isBoundHandler(handler)) {
    if (handler.protocol.alias === protocol.alias) {
      if (!warnedAliases.has(protocol.alias)) {
        warnedAliases.add(protocol.alias)
        logger('server-api').warn(
          `${protocol.alias}: handler is already bound — pass it to bind() directly; `
          + 'wrapping it again here is a type error (TS2345 "BoundEntrypointHandler<…> is not '
          + 'assignable"), tolerated at runtime for a project generated before the wrap-once rule.'
        )
      }

      return handler as unknown as BoundEntrypointHandler<Protocol>
    }

    return bind<Protocol, BasicContext<BasicConfig>>(protocol, () => {
      throw new HandlerMisconfiguredError(
        `${protocol.alias}: handler is bound to a different protocol ('${handler.protocol.alias}')`
      )
    })
  }

  return bind<Protocol, BasicContext<BasicConfig>>(protocol, () => {
    throw new HandlerMisconfiguredError(`${protocol.alias}: handler is not a function`)
  })
}

/**
 * Make server handlers that infer request sections and response values from their protocol.
 * The protocol is passed once; application callbacks never name request or reply generics.
 */
export const handlers = <Context extends BasicContext<BasicConfig>>() => ({
  body: <Protocol extends EntrypointProtocolDeclaration>(
    protocol: Protocol,
    handler: Protocol extends BodyProtocol<Protocol> ? (
        payload: BodyOf<Protocol>,
        context: Context,
        request: HandlerRequest<RequestOf<Protocol>>,
      ) => MaybePromise<HandlerResponse<ResponseOf<Protocol>>>
      : never,
  ): BoundEntrypointHandler<Protocol> => toleratedHandler(protocol, handler) ?? bind<Protocol, Context>(protocol, (request, context) =>
    (handler as (
      payload: BodyOf<Protocol>, context: Context, request: HandlerRequest<RequestOf<Protocol>>,
    ) => MaybePromise<HandlerResponse<ResponseOf<Protocol>>>)(request.body as BodyOf<Protocol>, context, request)),

  params: <Protocol extends EntrypointProtocolDeclaration>(
    protocol: Protocol,
    handler: Protocol extends ParamsProtocol<Protocol> ? (
        payload: ParamsOf<Protocol>,
        context: Context,
        request: HandlerRequest<RequestOf<Protocol>>,
      ) => MaybePromise<HandlerResponse<ResponseOf<Protocol>>>
      : never,
  ): BoundEntrypointHandler<Protocol> => toleratedHandler(protocol, handler) ?? bind<Protocol, Context>(protocol, (request, context) =>
    (handler as (
      payload: ParamsOf<Protocol>, context: Context, request: HandlerRequest<RequestOf<Protocol>>,
    ) => MaybePromise<HandlerResponse<ResponseOf<Protocol>>>)(request.params as ParamsOf<Protocol>, context, request)),

  request: <Protocol extends EntrypointProtocolDeclaration>(
    protocol: Protocol,
    handler: (
      request: HandlerRequest<RequestOf<Protocol>>,
      context: Context,
    ) => MaybePromise<HandlerResponse<ResponseOf<Protocol>>>,
  ): BoundEntrypointHandler<Protocol> => toleratedHandler(protocol, handler) ?? bind<Protocol, Context>(protocol, handler),
})

/** Access a Fastify-specific upload through an explicit boundary helper, never `request.original`. */
export const uploadedFile = async (
  request: HandlerRequest<{ body: object }>,
): Promise<import('@fastify/multipart').MultipartFile | undefined> => {
  const original = (request as AbstractRequest).original
  if (original == null || typeof original !== 'object' || !('file' in original)) return undefined

  return (original as import('fastify').FastifyRequest).file()
}
