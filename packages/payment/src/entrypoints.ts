import { body, filter, entrypoint } from '@owlmeans/entrypoint'
import { route, backend, RouteMethod } from '@owlmeans/route'
import { paymentApi } from './consts.js'
import { SubscriptionPropagateBodySchema } from './model/subscription.js'
import { CreateCheckoutBodySchema } from './model/checkout.js'

export const entrypoints = [
  entrypoint(route(paymentApi.subscription.base, '/subscription', backend())),
  entrypoint(
    route(paymentApi.subscription.propogate, '/propogate', backend(
      paymentApi.subscription.base,
      RouteMethod.POST
    )),
    filter(body(SubscriptionPropagateBodySchema))
  ),
  entrypoint(
    route(paymentApi.subscription.propagate, '/propagate', backend(
      paymentApi.subscription.base,
      RouteMethod.POST
    )),
    filter(body(SubscriptionPropagateBodySchema))
  )
]

export const serviceEntrypoints = [
  entrypoint(route(paymentApi.service.base, '/payment-service', backend())),
  entrypoint(
    route(paymentApi.service.checkout.base, '/checkout', backend(paymentApi.service.base)),
  ),
  entrypoint(
    route(paymentApi.service.checkout.session.base, '/session', backend(paymentApi.service.checkout.base)),
  ),
  entrypoint(
    route(paymentApi.service.checkout.session.external.base, '/external', backend(paymentApi.service.checkout.session.base)),
  ),
  entrypoint(
    route(paymentApi.service.checkout.session.external.create, '/create', backend(
      paymentApi.service.checkout.session.external.base,
      RouteMethod.POST
    )),
    filter(body(CreateCheckoutBodySchema))
  )
]