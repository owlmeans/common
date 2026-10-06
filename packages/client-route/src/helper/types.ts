import type { ClientRouteModel } from '../types.js'

/** Reads client route models and their paths. */
export interface ClientRouteHelper {
  /** Whether a route model was marked as a client one. */
  isClientRouteModel: (route: Object) => route is ClientRouteModel
  /** The names of the `:param` segments of a path, in order. */
  extractParams: (path: string) => string[]
}
