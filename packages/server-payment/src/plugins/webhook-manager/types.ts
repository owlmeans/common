import type Stripe from 'stripe'
import type { CommonServiceRoute } from '@owlmeans/route'
import type { PaymentWebhookRecord } from '../../types.js'

export interface EnsureWebhookOptions {
  /** Verify the stored endpoint still exists even when nothing changed locally. */
  force?: boolean
}

/** A deployment's Stripe webhook: where it is served, the managed endpoint, its secrets and its deliveries. */
export interface WebhookHelper {
  /** The alias whose host and base form the webhook URL: the gateway's `webhookService`, else `cfg.service`. */
  webhookServiceOf: () => string
  /** The key this deployment's Stripe rows are stored under: the gateway's `owner`, else `cfg.service`. */
  gatewayOwnerOf: () => string
  /** @throws WebhookSetupError('service:<alias>') when the webhook service is not declared in `cfg.services`. */
  webhookRouteOf: (alias?: string) => CommonServiceRoute
  /** This deployment's public webhook URL for a paygate, on the webhook service's host and base. */
  webhookUrlOf: (paygate?: string) => string
  /**
   * Keep exactly one Stripe webhook endpoint for this deployment at its own URL, subscribed to
   * `WEBHOOK_EVENTS` on the client's API version, and persist its signing secret — which Stripe
   * returns only when an endpoint is created.
   *
   * A deployment's identity is its webhook URL (`webhookUrlOf`: the `webhookService` alias's host and
   * base); its rows are keyed by the gateway's `owner` (`gatewayOwnerOf`). Several deployments of one
   * application may share a Stripe account — a test-mode account commonly serves every non-production
   * deployment — each with its own database and URL, so a deployment deletes only the endpoints its
   * own `payment-webhook` rows name.
   *
   * - A URL Stripe cannot deliver to (not https, a loopback or dotless host) is skipped.
   * - An unchanged `{ url, apiVersion, events }` fingerprint makes no paygate call at all.
   * - `force` first verifies the stored endpoint still exists; one deleted from outside loses its row
   *   and is created again.
   * - Changed events on the same API version update the endpoint in place.
   * - A changed API version (create-only on an endpoint) deletes and recreates it.
   * - An endpoint already at this exact URL that no row names is replaced: its secret is unknown here.
   * - A row of this paygate and owner at another URL is a URL this deployment has left — a moved host,
   *   or a new `webhookService`: once the endpoint at the current URL is in place, the endpoint that
   *   row names is deleted (already gone is fine), then the row.
   * - An endpoint at another URL that no row of this deployment names belongs to another deployment
   *   and is never deleted — whatever its metadata says.
   * - Replicas racing to persist one row: the endpoint created last is the live one.
   * - A created endpoint carries `{ owlmeans: 'payment', service: <owner> }` metadata and the
   *   `owlmeans:<owner>` description for operators.
   */
  ensureWebhookEndpoint: (stripe: Stripe, opts?: EnsureWebhookOptions) => Promise<PaymentWebhookRecord | null>
  /**
   * The secrets a Stripe signature may be verified with, in order: the configured file secret (an
   * override), then the one stored for the managed endpoint — the newest row of the gateway's `owner`,
   * so a process receiving the webhook finds the secret whichever process of the owner stored it.
   */
  stripeWebhookSecrets: () => Promise<string[]>
  /** The secret a Stripe signature is verified with. @throws WebhookSetupError('secret') */
  stripeWebhookSecret: () => Promise<string>
  /**
   * Verify a Stripe webhook against the configured override secret, then the managed endpoint's
   * stored one, and dispatch it.
   *
   * @throws PaygateSignatureError | WebhookSetupError('secret')
   */
  handleStripeWebhook: (stripe: Stripe, request: unknown) => Promise<void>
}
