import type { EntrypointProtocolDeclaration, OpenValue, RequestOf } from '@owlmeans/entrypoint'
import type { BoundEntrypointHandler } from '@owlmeans/server-entrypoint'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

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
export type IsUntypedResponse<T> = 0 extends (1 & T) ? true : [T] extends [undefined] ? true : false

/**
 * The type a bound handler is allowed to return for a given protocol response.
 *
 * A concretely typed or schema-backed `Response` is returned unchanged — the handler must produce
 * exactly that shape. An untyped one (see `IsUntypedResponse` above) relaxes to `any`: the
 * declaration made no promise about the response, so nothing here should force a handler bound to
 * it into returning `void`.
 */
export type HandlerResponse<Response> = IsUntypedResponse<Response> extends true ? any : Response

export type MaybePromise<Value> = Value | Promise<Value>

export type BodyProtocol<Protocol extends EntrypointProtocolDeclaration> = RequestOf<Protocol> extends { body: OpenValue }
  ? Protocol : never

export type ParamsProtocol<Protocol extends EntrypointProtocolDeclaration> = RequestOf<Protocol> extends { params: object }
  ? Protocol : never

export type Config = ServerConfig

export type Context = ServerContext<Config>

export interface ContextCarrier<Context> {
  _ctx?: Context
}

/** Structural, not `instanceof`: a `BoundEntrypointHandler` crosses no class boundary a runtime check could use. */
export type AnyBoundHandler = BoundEntrypointHandler<EntrypointProtocolDeclaration>
