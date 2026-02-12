import { body, filter, module } from '@owlmeans/module'
import { route, backend, RouteMethod } from '@owlmeans/route'
import { paymentApi } from './consts.js'
import { SubscriptionPropagateBodySchema } from './model/subscription.js'
import { CreateCheckoutBodySchema } from './model/checkout.js'

export const modules = [
  module(route(paymentApi.subscription.base, '/subscription', backend())),
  module(
    route(paymentApi.subscription.propogate, '/propogate', backend(
      paymentApi.subscription.base,
      RouteMethod.POST
    )),
    filter(body(SubscriptionPropagateBodySchema))
  ),
  module(
    route(paymentApi.subscription.propagate, '/propagate', backend(
      paymentApi.subscription.base,
      RouteMethod.POST
    )),
    filter(body(SubscriptionPropagateBodySchema))
  )
]

export const serviceModules = [
  module(route(paymentApi.service.base, '/payment-service', backend())),
  module(
    route(paymentApi.service.checkout.base, '/checkout', backend(paymentApi.service.base)),
  ),
  module(
    route(paymentApi.service.checkout.session.base, '/session', backend(paymentApi.service.checkout.base)),
  ),
  module(
    route(paymentApi.service.checkout.session.external.base, '/external', backend(paymentApi.service.checkout.session.base)),
  ),
  module(
    route(paymentApi.service.checkout.session.external.create, '/create', backend(
      paymentApi.service.checkout.session.external.base,
      RouteMethod.POST
    )),
    filter(body(CreateCheckoutBodySchema))
  )
]