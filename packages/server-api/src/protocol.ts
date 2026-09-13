import { assertContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { EntrypointOutcome } from '@owlmeans/entrypoint'
import type {
  BodyOf, EntrypointProtocolDeclaration, HandlerRequest, OpenRequest, OpenValue, ParamsOf, RequestOf, ResponseOf,
} from '@owlmeans/entrypoint'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { BoundEntrypointHandler } from '@owlmeans/server-entrypoint'

/**
 * True for a response the declaration left with no compile-time contract: `typed<any>()` (an
 * `[any] extends [X]` conditional does not produce `any`'s usual both-branches union once the
 * checked type is wrapped in a tuple, so it resolves to a single branch like any other type) and
 * a response inferred as bare `typed()` with nothing to infer from, which resolves to `undefined`
 * with no shape to validate a handler's return against — the same signal a zero-argument
 * `contract()` produces for a genuinely response-less route. Neither means "this handler must
 * return void": it means the declaration did not constrain the response, so the handler is free to
 * return whatever its route actually sends.
 */
type IsUntypedResponse<T> = 0 extends (1 & T) ? true : [T] extends [undefined] ? true : false

/**
 * The type a bound handler is allowed to return for a given protocol response.
 *
 * A concretely typed or schema-backed `Response` is returned unchanged — the handler must produce
 * exactly that shape. An untyped one (see `IsUntypedResponse` above) relaxes to `any`: the
 * declaration made no promise about the response, so nothing here should force a handler bound to
 * it into returning `void`.
 */
type HandlerResponse<Response> = IsUntypedResponse<Response> extends true ? any : Response
type MaybePromise<Value> = Value | Promise<Value>
type BodyProtocol<Protocol extends EntrypointProtocolDeclaration> = RequestOf<Protocol> extends { body: OpenValue }
  ? Protocol : never
type ParamsProtocol<Protocol extends EntrypointProtocolDeclaration> = RequestOf<Protocol> extends { params: object }
  ? Protocol : never

interface ContextCarrier<Context> {
  _ctx?: Context
}

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
  ): BoundEntrypointHandler<Protocol> => bind<Protocol, Context>(protocol, (request, context) =>
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
  ): BoundEntrypointHandler<Protocol> => bind<Protocol, Context>(protocol, (request, context) =>
    (handler as (
      payload: ParamsOf<Protocol>, context: Context, request: HandlerRequest<RequestOf<Protocol>>,
    ) => MaybePromise<HandlerResponse<ResponseOf<Protocol>>>)(request.params as ParamsOf<Protocol>, context, request)),

  request: <Protocol extends EntrypointProtocolDeclaration>(
    protocol: Protocol,
    handler: (
      request: HandlerRequest<RequestOf<Protocol>>,
      context: Context,
    ) => MaybePromise<HandlerResponse<ResponseOf<Protocol>>>,
  ): BoundEntrypointHandler<Protocol> => bind<Protocol, Context>(protocol, handler),
})

/** Access a Fastify-specific upload through an explicit boundary helper, never `request.original`. */
export const uploadedFile = async (
  request: HandlerRequest<{ body: object }>,
): Promise<import('@fastify/multipart').MultipartFile | undefined> => {
  const original = (request as AbstractRequest).original
  if (original == null || typeof original !== 'object' || !('file' in original)) return undefined

  return (original as import('fastify').FastifyRequest).file()
}
