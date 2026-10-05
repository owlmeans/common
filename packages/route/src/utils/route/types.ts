import type { RouteAddress, RouteDeclaration, ResolvedServiceRoute } from '../../types.js'

/**
 * Where routes answer, worked out on demand against the context that asks — a declaration states
 * only what it contributes and every address question walks the parent chain through the context.
 */
export interface RouteAddressHelper {
  /**
   * The declaration of the route's parent entrypoint, or `null` for a root route.
   *
   * @throws {SyntaxError} when the parent provides no route or the parent chain is a cycle
   */
  getParentRoute: (route: RouteDeclaration) => RouteDeclaration | null
  /**
   * Pick the service route this declaration answers on: the one it names, else the default of its
   * app type, else the first of its app type.
   *
   * @throws {SyntaxError}
   */
  resolveService: (route: RouteDeclaration) => ResolvedServiceRoute
  /**
   * The full path: every ancestor's declared segment, then this one. Walks the parent chain through
   * the context, so a declaration always states only what it contributes.
   */
  resolvePath: (route: RouteDeclaration) => string
  /** `base` + the full path — what a server mounts and a client requests. */
  resolveMount: (route: RouteDeclaration) => string
  /**
   * Where the route answers. A backend caller reaching a service over its INTERNAL host is inside the
   * cluster, so that hop is never TLS.
   */
  resolveAddress: (route: RouteDeclaration) => RouteAddress
  /** Does this route belong to the service the asking context IS? */
  isLocalRoute: (route: RouteDeclaration) => boolean
}
