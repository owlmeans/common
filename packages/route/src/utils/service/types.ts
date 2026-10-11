import type { CommonServiceRoute, ResolvedServiceRoute } from '../../types.js'

/** Recognizes configured service routes. */
export interface ServiceRouteHelper {
  /** Whether a configured value is a service route: it names a service and a known app type. */
  isServiceRoute: (obj?: Object) => obj is CommonServiceRoute
  /** A service route is usable exactly when it knows the host it answers on. */
  isServiceRouteResolved: (route: CommonServiceRoute) => route is ResolvedServiceRoute
}
