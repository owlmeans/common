import type { RouteDeclaration, RouteModel } from '@owlmeans/route'
import { UnknownQueue } from './errors.js'
import { QUEUE_PROTOCOL } from './consts.js'
import type { QueueRouteOptions } from './types.js'
import type { QueueRouteHelper } from './queue-route/types.js'

export const createQueueRouteHelper = (): QueueRouteHelper => {
  const isQueueRoute = (route: RouteDeclaration | RouteModel): boolean =>
    ('route' in route ? route.route : route).protocol === QUEUE_PROTOCOL

  const queueRouteOptions = (
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

  return { isQueueRoute, queueRouteOptions }
}

export const queueRouteHelper = createQueueRouteHelper()
