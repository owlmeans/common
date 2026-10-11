import type { AbstractRequest, EntrypointHandler } from '@owlmeans/entrypoint'
import type { ClientEntrypointOptions, EntrypointInvoke, EntrypointUrlOptions } from '../../types.js'

/** How a client entrypoint reaches its backend: the handler, the round trip and the address. */
export interface ApiCallHelper<T, R extends AbstractRequest = AbstractRequest> {
  /**
   * The handler that carries the entrypoint's call: the transport service bound to its route's
   * protocol, else the API client of the web service its route answers on.
   */
  apiHandler: EntrypointHandler
  /** The round trip behind `invoke()`: builds the request, validates it on demand and notifies failure observers. */
  apiInvoke: (opts?: ClientEntrypointOptions) => EntrypointInvoke<T, R>
  /** The address behind `url()`: `:params` filled in, the query appended, absolute when the route is not local. */
  entrypointUrl: (req?: Partial<R>, opts?: EntrypointUrlOptions) => Promise<string>
}
