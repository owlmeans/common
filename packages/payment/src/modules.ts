import { body, filter, module } from '@owlmeans/module'
import { route, backend, RouteMethod } from '@owlmeans/route'
import { paymentApi } from './consts.js'
import { SubscriptionPropogateBodySchema } from './model/subscription.js'

export const modules = [
  module(route(paymentApi.subscription.base, '/subscription', backend())),
  module(
    route(paymentApi.subscription.propogate, '/propogate', backend(
      paymentApi.subscription.base,
      RouteMethod.POST
    )),
    filter(body(SubscriptionPropogateBodySchema))
  )
]
