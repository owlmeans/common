import type { AppType } from '@owlmeans/context'
import type { RouteProtocols, RouteMethod } from './consts'

export interface BasicRoute {
  type: AppType
  service?: string
  host?: string
  port?: number
  base?: string
  internalHost?: string
  internalPort?: number
}

/**
 * The plain, declarative half of a route — what a `route()` call produces and what an application
 * ships in its contract package. It is never rewritten: `path` stays the segment this route
 * contributes under its parent, and the address is worked out on demand against a context.
 */
export interface RouteDeclaration extends BasicRoute {
  alias: string
  path: string
  parent?: string
  default?: boolean
  method?: RouteMethod
  protocol?: RouteProtocols
  secure?: boolean
  /**
   * QUEUE routes only: the queue that carries this entrypoint's jobs. It names an address, not a
   * process — which queues a given process consumes is configuration, never a declaration.
   */
  queue?: string
  /**
   * QUEUE routes only: whether the caller waits for the job's return value. `false` resolves as
   * soon as the job is accepted, which is what a long pipeline wants; the default is to wait.
   */
  reply?: boolean
  /** How long a caller waits for an answer, in milliseconds, when the transport supports it. */
  timeout?: number
}

export interface CommonServiceRoute extends BasicRoute {
  home?: string
  service: string
  default?: boolean
}

export interface ResolvedServiceRoute extends CommonServiceRoute {
  host: string
}

/** Where a route actually answers, once its service has been picked. */
export interface RouteAddress {
  host: string
  port?: number
  base?: string
  secure: boolean
  protocol: RouteProtocols
}

/**
 * The model wrapping a declaration. It carries no resolution state of its own — every address
 * question is answered from the declaration plus the context that asks.
 */
export interface RouteModel {
  route: RouteDeclaration
}

export interface RouteOptions extends Partial<RouteDeclaration> {
}
