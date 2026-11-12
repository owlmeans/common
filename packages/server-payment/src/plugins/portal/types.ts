import type { PortalLinkOptions } from '../../types.js'

/** The customer portal of a context: which paygate, customer and subscription a portal session opens on. */
export interface PortalHelper {
  /**
   * A customer-portal session for one entity, through `opts.paygate`, else the paygate of the
   * entity's entitling subscription, else the first registered paygate holding a customer of the
   * entity. `Manage` opens the portal home and `PaymentMethod` the payment method form; `Cancel`,
   * `Update` and `Change` act on the entity's entitling subscription of that paygate (`Change`
   * confirms a switch of its one item to `planSku`'s price).
   *
   * @throws PortalUnavailable('customer' | 'paygate' | 'subscription' | 'plan' | 'item') | UnknownPlan
   */
  createPortalLink: (entityId: string, opts: PortalLinkOptions) => Promise<string>
}
