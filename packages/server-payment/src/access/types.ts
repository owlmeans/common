import type Stripe from 'stripe'
import type { PaymentService } from '@owlmeans/payment'
import type {
  BillingProfileResource, CompletionObserver, ConsumerConsentResource, ConsumerDeclarationResource,
  ConsumerEventResource, ConsumerMailPluginConfig, ConsumerRightsService, EntitlementService, FingerprintResource,
  GatewayService, PaygateCustomerResource, PaymentFulfillmentResource, PaymentSubscriptionRecord,
  PaymentSubscriptionResource, PaymentUsageCounterResource, PaymentUsageResource, PaymentWebhookResource,
  PortalBrandingConfig, PurchaseResource, StripePluginConfig, StripePricingPluginConfig,
} from '../types.js'

/** What one context holds for payments: its services, its resources, its plugin configs and its Stripe client. */
export interface PaymentAccess {
  payment: () => PaymentService
  gateway: () => GatewayService
  /** The gateway, or `null` in a context that registered none. */
  gatewayOf: () => GatewayService | null
  observer: () => CompletionObserver
  entitlements: () => EntitlementService
  paygateCustomers: () => PaygateCustomerResource
  subscriptions: () => PaymentSubscriptionResource
  fulfillments: () => PaymentFulfillmentResource
  paymentWebhooks: () => PaymentWebhookResource
  usageEvents: () => PaymentUsageResource
  usageCounters: () => PaymentUsageCounterResource
  fingerprints: () => FingerprintResource
  billingProfiles: () => BillingProfileResource
  purchases: () => PurchaseResource
  consumerConsents: () => ConsumerConsentResource
  consumerDeclarations: () => ConsumerDeclarationResource
  consumerEvents: () => ConsumerEventResource
  /** The consumer-rights service. @throws when it is not registered */
  consumerRights: (alias?: string) => ConsumerRightsService
  /** The consumer-rights service, or `null` in a process that registered none. */
  consumerRightsOf: (alias?: string) => ConsumerRightsService | null
  stripeConfig: () => Promise<StripePluginConfig>
  /** The portal branding declared with `portalBranding`, or `null`. */
  portalBrandingConfig: () => Promise<PortalBrandingConfig | null>
  /** The consumer-rights mail options declared with `declareConsumerRights`, or `null`. */
  consumerMailConfig: () => Promise<ConsumerMailPluginConfig | null>
  /** The Stripe-only pricing settings declared with `declarePaymentPricing`, or `null`. */
  stripePricingConfig: () => Promise<StripePricingPluginConfig | null>
  /**
   * A Stripe client pinned to {@link STRIPE_PINNED_API_VERSION}: the API version this package's payload
   * readers, the stored webhook endpoints and the test doubles are written for. The installed SDK is typed
   * for a newer one, so a read of a field the newer version moved (a subscription's period, an invoice's
   * subscription) is cast at the seam until the readers are migrated — the pin is what keeps the shapes
   * the code parses and the shapes Stripe sends the same.
   */
  stripeClient: () => Promise<Stripe>
  /** The entity's highest-ranked entitling subscription of one product. */
  activeSubscription: (entityId: string, productSku: string) => Promise<PaymentSubscriptionRecord | null>
}
