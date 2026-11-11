import type { PaymentService } from '@owlmeans/payment'
import type {
  BillingProfileResource, CompletionObserver, ConsumerConsentResource, ConsumerDeclarationResource,
  ConsumerEventResource, ConsumerMailPluginConfig, ConsumerRightsService, EntitlementService, FingerprintResource,
  GatewayService, PaygateCustomerResource, PaymentFulfillmentResource, PaymentGrantResource, PaymentSubscriptionRecord,
  PaymentSubscriptionResource, PaymentUsageCounterResource, PaymentUsageResource, PaymentWebhookResource,
  PurchaseResource,
} from '../types.js'
import type { PaygateRegistry } from '../paygate/types.js'
import type { EntitlementGrantHelper } from '../grants/types.js'

/** What one context holds for payments: its services, its resources, its plugin configs and its paygates. */
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
  /** The entitlement grant records (`payment-grant`). @throws when the resource is not registered */
  grantRecords: () => PaymentGrantResource
  /** The entitlement grant records, or `null` in a context that registered none (no grants at all). */
  grantRecordsOf: () => PaymentGrantResource | null
  /** The organization entitlement grants: give, revoke, list and read what is in force (`entitlementGrantsOf`). */
  grants: () => EntitlementGrantHelper
  billingProfiles: () => BillingProfileResource
  purchases: () => PurchaseResource
  consumerConsents: () => ConsumerConsentResource
  consumerDeclarations: () => ConsumerDeclarationResource
  consumerEvents: () => ConsumerEventResource
  /** The consumer-rights service. @throws when it is not registered */
  consumerRights: (alias?: string) => ConsumerRightsService
  /** The consumer-rights service, or `null` in a process that registered none. */
  consumerRightsOf: (alias?: string) => ConsumerRightsService | null
  /** The consumer-rights mail options declared with `declareConsumerRights`, or `null`. */
  consumerMailConfig: () => Promise<ConsumerMailPluginConfig | null>
  /** A backend-only plugin config record by id (a provider's own settings), or `null`. */
  pluginConfig: <T>(id: string) => Promise<T | null>
  /** The paygates of the registered payment providers (`paygatesOf`). */
  paygates: () => PaygateRegistry
  /** The entity's highest-ranked entitling subscription of one product. */
  activeSubscription: (entityId: string, productSku: string) => Promise<PaymentSubscriptionRecord | null>
}
