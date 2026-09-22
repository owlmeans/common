import type { AppType, EntrypointReference } from '@owlmeans/context'
import type { RouteProtocols, RouteMethod } from './consts'

/** A built-in or package-owned transport identifier. */
export type RouteProtocol = RouteProtocols | (string & {})

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
  protocol?: RouteProtocol
  secure?: boolean
  /** Transport-owned declaration data. The package defining `protocol` owns and validates it. */
  protocolOptions?: unknown
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
  protocol: RouteProtocol
}

/**
 * The model wrapping a declaration. It carries no resolution state of its own — every address
 * question is answered from the declaration plus the context that asks.
 */
export interface RouteModel {
  route: RouteDeclaration
}

export type RouteParent = string | EntrypointReference

export interface RouteOptions extends Omit<Partial<RouteDeclaration>, 'parent'> {
  /** A parent protocol is preferred in application declarations; strings remain adapter input. */
  parent?: RouteParent
}
