import { backend } from '@owlmeans/route'
import type { RouteDeclaration, RouteModel, RouteOptions } from '@owlmeans/route'
import { UnknownQueue } from './errors.js'

/** The transport identifier owned by the queue package. */
export const QUEUE_PROTOCOL = 'queue' as const

/** Queue-owned options stored in a generic route declaration. */
export interface QueueRouteOptions extends Omit<RouteOptions, 'protocol' | 'protocolOptions'> {
  queue: string
  reply?: boolean
}

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

/** Whether a declaration belongs to the queue transport. */
export const isQueueRoute = (route: RouteDeclaration | RouteModel): boolean =>
  ('route' in route ? route.route : route).protocol === QUEUE_PROTOCOL

/** Read and validate queue-owned route options. */
export const queueRouteOptions = (
  route: RouteDeclaration | RouteModel,
): Pick<QueueRouteOptions, 'queue' | 'reply'> => {
  const declaration = 'route' in route ? route.route : route
  if (declaration.protocol !== QUEUE_PROTOCOL
    || declaration.protocolOptions == null
    || typeof declaration.protocolOptions !== 'object') {
    throw new UnknownQueue(`${declaration.alias}: not a queue protocol`)
  }
  const options = declaration.protocolOptions as Record<string, unknown>
  if (typeof options.queue !== 'string' || options.queue.trim() === '') {
    throw new UnknownQueue(`${declaration.alias}: route declares no queue`)
  }
  if (options.reply != null && typeof options.reply !== 'boolean') {
    throw new UnknownQueue(`${declaration.alias}: invalid queue reply option`)
  }
  return { queue: options.queue, reply: options.reply as boolean | undefined }
}
