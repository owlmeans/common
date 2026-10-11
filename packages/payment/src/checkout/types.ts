import type { RouteParent } from '@owlmeans/route'
import type { EntrypointOptions, EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import type { AmountPolicyQuery, AmountPolicyView, PlanPriceList, PlanPricesQuery } from '../types.js'

export interface NarrowAmountPolicyOptions {
  productSku?: string
  planSku?: string
}

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

export interface CheckoutReadProtocols {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  /** The entity's amount policy as narrowed now — the same computation the checkout enforces. */
  amountPolicy: EntrypointProtocol<{ query: AmountPolicyQuery }, AmountPolicyView>
  /** The prices a product's plans are charged at, per currency, as last synchronized. */
  planPrices: EntrypointProtocol<{ query: PlanPricesQuery }, PlanPriceList>
}
