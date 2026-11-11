import type { CommonServiceRoute } from '@owlmeans/route'
import type { PaymentWebhookRecord } from '../../types.js'
import type { Paygate, PaygateDeployment } from '../../paygate/types.js'

export interface EnsureWebhookOptions {
  /** Verify the stored endpoint still exists even when nothing changed locally. */
  force?: boolean
}

/** A deployment's paygate webhooks: where they are served, the managed endpoints and their deliveries. */
export interface WebhookHelper {
  /** The alias whose host and base form the webhook URL: the gateway's `webhookService`, else `cfg.service`. */
  webhookServiceOf: () => string
  /** The key this deployment's paygate rows are stored under: the gateway's `owner`, else `cfg.service`. */
  gatewayOwnerOf: () => string
  /** @throws WebhookSetupError('service:<alias>') when the webhook service is not declared in `cfg.services`. */
  webhookRouteOf: (alias?: string) => CommonServiceRoute
  /** This deployment's public webhook URL for a paygate (`/<base>/webhook/<paygate>`), on the webhook service's host and base. */
  webhookUrlOf: (paygate: string) => string
  /** The deployment a paygate keeps its endpoint and portal configuration for: the owner and the webhook URL. */
  deploymentOf: (paygate: string) => PaygateDeployment
  /**
   * Keep the paygate's webhook endpoint for this deployment at its own URL
   * (`paygate.webhook.ensureEndpoint`). A deployment's identity is its webhook URL; its rows carry the
   * gateway's `owner`. A URL a paygate cannot deliver to (not https, a loopback or dotless host) is
   * skipped, and so is a paygate without `webhook`.
   */
  ensureWebhookEndpoint: (paygate: Paygate, opts?: EnsureWebhookOptions) => Promise<PaymentWebhookRecord | null>
  /**
   * Verify a delivery with the paygate (against the owner's secrets) and apply its events in order.
   *
   * @throws PaygateError('capability:webhook') | PaygateSignatureError | WebhookSetupError('secret')
   */
  handleDelivery: (paygate: Paygate, request: unknown) => Promise<void>
}
