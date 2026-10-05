import type { RouteDeclaration, RouteModel } from '@owlmeans/route'
import type { QueueRouteOptions } from '../types.js'

/** Reads a route declaration as one carried by the queue transport. */
export interface QueueRouteHelper {
  /** Whether a declaration belongs to the queue transport. */
  isQueueRoute: (route: RouteDeclaration | RouteModel) => boolean
  /**
   * Read and validate queue-owned route options.
   *
   * @throws {UnknownQueue} for a route of another protocol, or queue options that do not validate
   */
  queueRouteOptions: (route: RouteDeclaration | RouteModel) => Pick<QueueRouteOptions, 'queue' | 'reply'>
}
