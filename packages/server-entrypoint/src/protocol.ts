import { materializeEntrypoint } from '@owlmeans/entrypoint'
import { EntrypointOutcome } from '@owlmeans/entrypoint'
import type {
  AbstractRequest, AbstractResponse, EntrypointProtocolDeclaration, HandlerRequest, RequestOf, ResponseOf,
} from '@owlmeans/entrypoint'
import { assertContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { entrypoint } from './entrypoint.js'
import type {
  BoundEntrypointHandler, EntrypointOptions, ServerProtocolEntrypoint,
} from './types.js'

/** Bind one immutable protocol and, when present, its protocol-bound implementation. */
export const bind = <Protocol extends EntrypointProtocolDeclaration>(
  protocol: Protocol,
  implementation?: BoundEntrypointHandler<Protocol>,
  options?: EntrypointOptions<object>,
): ServerProtocolEntrypoint<Protocol> => {
  const bound = Object.assign(entrypoint(
    materializeEntrypoint(protocol),
    implementation?.bind,
    options,
  ), { protocol })

  return bound as ServerProtocolEntrypoint<Protocol>
}

/** Bind a flat declaration collection and pair each protocol with its own implementation. */
export const bindAll = <Protocol extends EntrypointProtocolDeclaration>(
  declarations: readonly Protocol[],
  implementations: readonly BoundEntrypointHandler<Protocol>[] = [],
): ServerProtocolEntrypoint<Protocol>[] => declarations.map(declaration =>
  bind(declaration, implementations.find(implementation => implementation.protocol === declaration)),
)

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

/** Bind one protocol to a handler without a mutable declaration or an alias lookup. */
export const implementation = <
  Protocol extends EntrypointProtocolDeclaration,
  Context extends BasicContext<BasicConfig>,
>(
  protocol: Protocol,
  handler: (
    request: HandlerRequest<RequestOf<Protocol>>,
    context: Context,
    response: AbstractResponse<ResponseOf<Protocol>>,
  ) => ResponseOf<Protocol> | Promise<ResponseOf<Protocol>>,
): BoundEntrypointHandler<Protocol> => ({
  protocol,
  bind: ref => async (request, response) => {
    const fallback = assertContext<BasicConfig, Context>(ref.ref?.ctx, protocol.alias)

    try {
      const value = await handler(
        request as unknown as HandlerRequest<RequestOf<Protocol>>,
        contextFor(request, fallback),
        response as AbstractResponse<ResponseOf<Protocol>>,
      )
      response.resolve(value, EntrypointOutcome.Ok)
    } catch (error) {
      response.reject(error as Error)
    }

    return response.value
  },
})
