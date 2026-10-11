import { backend, type RouteDeclaration, type RouteModel, type RouteOptions } from '@owlmeans/route'
import { QUEUE_PROTOCOL } from './consts.js'
import type { QueueRouteOptions } from './types.js'
import { queueRouteHelper } from './queue-route.js'

/** Declare a backend route carried by a queue. */
export const job = (
  opts: QueueRouteOptions,
  secondary?: Omit<QueueRouteOptions, 'queue'>,
): Partial<RouteOptions> => {
  const { queue, reply, ...routeOptions } = { ...opts, ...secondary }
  const declaration = backend(routeOptions)
  declaration.protocol = QUEUE_PROTOCOL
  declaration.protocolOptions = { queue, ...(reply == null ? {} : { reply }) }
  return declaration
}

/** @deprecated compat:factory-refactor — use `queueRouteHelper.isQueueRoute(…)` */
export const isQueueRoute = (route: RouteDeclaration | RouteModel): boolean => queueRouteHelper.isQueueRoute(route)

/** @deprecated compat:factory-refactor — use `queueRouteHelper.queueRouteOptions(…)` */
export const queueRouteOptions = (route: RouteDeclaration | RouteModel): Pick<QueueRouteOptions, 'queue' | 'reply'> =>
  queueRouteHelper.queueRouteOptions(route)
