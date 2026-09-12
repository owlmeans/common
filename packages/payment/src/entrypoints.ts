import { contract, protocol, protocols, typed } from '@owlmeans/entrypoint'
import { route, backend, RouteMethod } from '@owlmeans/route'
import { SubscriptionPropagateBodySchema } from './model/subscription.js'
import { CreateCheckoutBodySchema, CreateCheckoutResponseSchema } from './model/checkout.js'

const aliases = {
  subscription: {
    base: 'payment-api:subscription',
    typo: 'payment-api:subscription:propogate',
    propagate: 'payment-api:subscription:propagate',
  },
  service: {
    base: 'payment-service:base',
    checkout: 'payment-service:checkout',
    session: 'payment-service:checkout:session',
    external: 'payment-service:checkout:session:external',
    create: 'payment-service:checkout:session:external:create',
  },
} as const

const subscriptionBase = protocol(route(aliases.subscription.base, '/subscription', backend()), contract())
const serviceBase = protocol(route(aliases.service.base, '/payment-service', backend()), contract())
const checkoutBase = protocol(
  route(aliases.service.checkout, '/checkout', backend({ parent: serviceBase })), contract(),
)
const sessionBase = protocol(
  route(aliases.service.session, '/session', backend({ parent: checkoutBase })), contract(),
)
const externalBase = protocol(
  route(aliases.service.external, '/external', backend({ parent: sessionBase })), contract(),
)

/** Public payment protocols. Alias strings stay private to this declaration module. */
export const paymentApi = {
  subscription: {
    base: subscriptionBase,
    /** @deprecated Use propagate instead. */
    propogate: protocol(
      route(aliases.subscription.typo, '/propogate', backend({ parent: subscriptionBase, method: RouteMethod.POST })),
      contract.request({ body: SubscriptionPropagateBodySchema }, typed<undefined>()),
    ),
    propagate: protocol(
      route(aliases.subscription.propagate, '/propagate', backend({ parent: subscriptionBase, method: RouteMethod.POST })),
      contract.request({ body: SubscriptionPropagateBodySchema }, typed<undefined>()),
    ),
  },
  service: {
    base: serviceBase,
    checkout: {
      base: checkoutBase,
      session: {
        base: sessionBase,
        external: {
          base: externalBase,
          create: protocol(
            route(aliases.service.create, '/create', backend({ parent: externalBase, method: RouteMethod.POST })),
            contract.request({ body: CreateCheckoutBodySchema }, CreateCheckoutResponseSchema),
          ),
        },
      },
    },
  },
} as const

export const entrypoints = protocols(paymentApi.subscription)
export const serviceEntrypoints = protocols(paymentApi.service)
