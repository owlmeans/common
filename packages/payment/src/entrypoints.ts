import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { route, backend, RouteMethod } from '@owlmeans/route'
import { paymentApi } from './consts.js'
import { SubscriptionPropagateBodySchema } from './model/subscription.js'
import { CreateCheckoutBodySchema } from './model/checkout.js'

export const entrypoints = [
  openProtocol(route(paymentApi.subscription.base, '/subscription', backend())),
  protocol(
    route(paymentApi.subscription.propogate, '/propogate', backend(
      paymentApi.subscription.base,
      RouteMethod.POST
    )),
    contract.request({ body: SubscriptionPropagateBodySchema }, typed())
  ),
  protocol(
    route(paymentApi.subscription.propagate, '/propagate', backend(
      paymentApi.subscription.base,
      RouteMethod.POST
    )),
    contract.request({ body: SubscriptionPropagateBodySchema }, typed())
  )
]

export const serviceEntrypoints = [
  openProtocol(route(paymentApi.service.base, '/payment-service', backend())),
  openProtocol(
    route(paymentApi.service.checkout.base, '/checkout', backend(paymentApi.service.base)),
  ),
  openProtocol(
    route(paymentApi.service.checkout.session.base, '/session', backend(paymentApi.service.checkout.base)),
  ),
  openProtocol(
    route(paymentApi.service.checkout.session.external.base, '/external', backend(paymentApi.service.checkout.session.base)),
  ),
  protocol(
    route(paymentApi.service.checkout.session.external.create, '/create', backend(
      paymentApi.service.checkout.session.external.base,
      RouteMethod.POST
    )),
    contract.request({ body: CreateCheckoutBodySchema }, typed())
  )
]
