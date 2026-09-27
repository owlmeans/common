import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import type { EntrypointOptions, EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import type { RouteParent } from '@owlmeans/route'
import {
  AmountPolicyQuerySchema, AmountPolicyViewSchema, PlanPriceListSchema, PlanPricesQuerySchema,
} from '../model/consumer.js'
import type { AmountPolicyQuery, AmountPolicyView, PlanPriceList, PlanPricesQuery } from '../types.js'

export const CHECKOUT_READ_API_PATH = '/checkout'

export interface CheckoutReadProtocolOptions {
  /** Alias prefix of every declaration, e.g. `my-app:account:checkout`. */
  prefix: string
  /** The application's guarded parent — its guards and gate are inherited. */
  parent?: RouteParent
  guards?: EntrypointOptions['guards']
  gate?: EntrypointOptions['gate']
  /** Default `/checkout`. */
  path?: string
}

export type CheckoutReadProtocols = {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  /** The entity's amount policy as narrowed now — the same computation the checkout enforces. */
  amountPolicy: EntrypointProtocol<{ query: AmountPolicyQuery }, AmountPolicyView>
  /** The prices a product's plans are charged at, per currency, as last synchronized. */
  planPrices: EntrypointProtocol<{ query: PlanPricesQuery }, PlanPriceList>
}

/**
 * The read side of checkout: `amountPolicy` GET `/amount-policy?productSku&planSku` and
 * `planPrices` GET `/plan-prices?productSku`, under the application's guarded `parent` (or its own
 * `guards`). Aliases are `<prefix>:<name>`.
 */
export const makeCheckoutReadProtocols = (opts: CheckoutReadProtocolOptions): CheckoutReadProtocols => {
  if (opts.parent == null && opts.guards == null) {
    throw new SyntaxError('checkout-read: the routes need either a parent or explicit guards')
  }
  const alias = (name: string): string => `${opts.prefix}:${name}`
  const path = opts.path ?? CHECKOUT_READ_API_PATH
  const base = opts.parent != null
    ? openProtocol(route(alias('base'), path, backend({ parent: opts.parent })))
    : openProtocol(route(alias('base'), path, backend()), {
        guards: opts.guards,
        ...(opts.gate != null ? { gate: opts.gate } : {}),
      })

  return {
    base,
    amountPolicy: protocol(
      route(alias('amount-policy'), '/amount-policy', backend({ parent: base, method: RouteMethod.GET })),
      contract.request({ query: typed<AmountPolicyQuery>(AmountPolicyQuerySchema) }, AmountPolicyViewSchema),
    ),
    planPrices: protocol(
      route(alias('plan-prices'), '/plan-prices', backend({ parent: base, method: RouteMethod.GET })),
      contract.request({ query: typed<PlanPricesQuery>(PlanPricesQuerySchema) }, PlanPriceListSchema),
    ),
  }
}
