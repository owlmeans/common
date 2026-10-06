import type Stripe from 'stripe'
import type { PortalLinkOptions } from '../../types.js'

export interface EnsurePortalOptions {
  force?: boolean
}

/** The Stripe customer portal of a deployment: its configuration and its sessions. */
export interface PortalHelper {
  /** The fingerprint sku of an owner's portal configuration: `portal:<owner>`. */
  portalFingerprintSku: (owner: string) => string
  /**
   * Keep this deployment's own Stripe customer-portal configuration: customer, invoice and payment
   * method self-service, cancellation at period end, and switching between the active recurring
   * prices of every product sold through Stripe (both subscription features off when there are none).
   * The customer may edit their tax id always, their e-mail unless `stripe.lockCustomerEmail`, their
   * address unless the consumer-rights `countryLock` or `stripe.lockCustomerCountry`.
   *
   * A deployment's identity is its webhook URL (`webhookUrlOf`, on the gateway's `webhookService`) —
   * also when that URL is undeliverable, as on a local run; its fingerprint row and label carry the
   * gateway's `owner` (`gatewayOwnerOf`). Several deployments of one application may share a Stripe
   * account, so each owns a configuration of its own, tagged
   * `{ owlmeans: 'payment', service: <owner>, deployment: <webhook URL> }`.
   *
   * - An unchanged declaration (catalogue, branding, deployment key) makes no paygate call.
   * - The configuration the `portal:<owner>` fingerprint row names is updated in place — unless its
   *   metadata tags it for another deployment (a moved webhook URL included), which is never
   *   overwritten; this deployment then proceeds as though it held no row.
   * - Without a usable row, an active configuration tagged with exactly this owner and deployment
   *   key is adopted. Nothing else is: not an untagged one, not one carrying only the owner label,
   *   not one tagged for another deployment.
   * - Otherwise a new configuration is created. Stripe cannot delete a portal configuration, so one
   *   this deployment can no longer identify stays in the account, and a lost row creates a new one
   *   unless its tagged configuration is found.
   */
  ensurePortalConfiguration: (stripe: Stripe, opts?: EnsurePortalOptions) => Promise<string | null>
  /**
   * A Stripe customer-portal session for one entity. `Manage` opens the portal home and
   * `PaymentMethod` the payment method form; `Cancel`, `Update` and `Change` act on the entity's
   * entitling Stripe subscription (`Change` confirms a switch of its one item to `planSku`'s price).
   *
   * @throws PortalUnavailable('customer' | 'subscription' | 'plan' | 'item')
   */
  createPortalLink: (stripe: Stripe, entityId: string, opts: PortalLinkOptions) => Promise<string>
}
