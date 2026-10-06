import type Stripe from 'stripe'
import { MONGO_DUPLICATE_KEY } from '@owlmeans/mongo-resource'
import { WebhookSetupError, type PaymentService } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { CONSUMER_RIGHTS_SERVICE } from './consts.js'
import { paymentAccessOf } from './access.js'
import type {
  CompletionObserver, ConsumerConsentResource, ConsumerRightsService, EntitlementService, GatewayService,
  PaymentFulfillmentResource, PaymentSubscriptionResource, PurchaseResource,
} from './types.js'
import type { CollectionHolder, PaymentUtils } from './utils/types.js'

export const createPaymentUtils = (): PaymentUtils => {
  const apiVersionOf = (stripe: Stripe): string => {
    const version = (stripe as unknown as { getApiField?: (key: string) => unknown }).getApiField?.('version')
    if (typeof version !== 'string' || version === '') {
      throw new WebhookSetupError('api-version')
    }

    return version
  }

  const isDuplicateKey = (error: unknown): boolean =>
    (error as { code?: unknown } | null)?.code === MONGO_DUPLICATE_KEY

  const isMissingObject = (error: unknown): boolean => {
    const typed = error as { code?: unknown; statusCode?: unknown; raw?: { code?: unknown } } | null
    return typed?.code === 'resource_missing' || typed?.raw?.code === 'resource_missing' || typed?.statusCode === 404
  }

  const idOf = (value: string | { id?: string } | null | undefined): string | undefined =>
    value == null ? undefined : typeof value === 'string' ? value : value.id

  const dateOf = (seconds: number | null | undefined): Date | undefined =>
    seconds == null ? undefined : new Date(seconds * 1000)

  const compact = <T extends object>(value: T): T =>
    Object.fromEntries(Object.entries(value).filter(([, entry]) => entry != null)) as T

  const conditionalSet = async (
    resource: CollectionHolder, filter: Record<string, unknown>, set: Record<string, unknown>,
  ): Promise<boolean> => {
    const collection = resource.collection as {
      updateOne: (filter: object, update: object) => Promise<{ matchedCount?: number, modifiedCount?: number }>
    }
    const result = await collection.updateOne(filter, { $set: set })

    return (result.matchedCount ?? result.modifiedCount ?? 0) > 0
  }

  const conditionalDelete = async (resource: CollectionHolder, filter: Record<string, unknown>): Promise<boolean> => {
    const collection = resource.collection as { deleteOne: (filter: object) => Promise<{ deletedCount?: number }> }
    const result = await collection.deleteOne(filter)

    return (result.deletedCount ?? 0) > 0
  }

  const errorText = (error: unknown): string =>
    (error instanceof Error ? error.message : String(error)).slice(0, 1000)

  return {
    apiVersionOf, isDuplicateKey, isMissingObject, idOf, dateOf, compact, conditionalSet, conditionalDelete, errorText,
  }
}

export const paymentUtils = createPaymentUtils()

/** @deprecated compat:factory-refactor — use `paymentAccessOf(ctx).payment()` */
export const payment = (ctx: ApiContext): PaymentService => paymentAccessOf(ctx).payment()

/** @deprecated compat:factory-refactor — use `paymentAccessOf(ctx).gateway()` */
export const gateway = (ctx: ApiContext): GatewayService => paymentAccessOf(ctx).gateway()

/** @deprecated compat:factory-refactor — use `paymentAccessOf(ctx).observer()` */
export const observer = (ctx: ApiContext): CompletionObserver => paymentAccessOf(ctx).observer()

/** @deprecated compat:factory-refactor — use `paymentAccessOf(ctx).entitlements()` */
export const entitlements = (ctx: ApiContext): EntitlementService => paymentAccessOf(ctx).entitlements()

/** @deprecated compat:factory-refactor — use `paymentAccessOf(ctx).subscriptions()` */
export const subscriptions = (ctx: ApiContext): PaymentSubscriptionResource => paymentAccessOf(ctx).subscriptions()

/** @deprecated compat:factory-refactor — use `paymentAccessOf(ctx).fulfillments()` */
export const fulfillments = (ctx: ApiContext): PaymentFulfillmentResource => paymentAccessOf(ctx).fulfillments()

/** @deprecated compat:factory-refactor — use `paymentAccessOf(ctx).purchases()` */
export const purchases = (ctx: ApiContext): PurchaseResource => paymentAccessOf(ctx).purchases()

/** @deprecated compat:factory-refactor — use `paymentAccessOf(ctx).consumerConsents()` */
export const consumerConsents = (ctx: ApiContext): ConsumerConsentResource => paymentAccessOf(ctx).consumerConsents()

/** @deprecated compat:factory-refactor — use `paymentAccessOf(ctx).consumerRightsOf(…)` */
export const consumerRightsOf = (
  ctx: ApiContext, alias: string = CONSUMER_RIGHTS_SERVICE,
): ConsumerRightsService | null => paymentAccessOf(ctx).consumerRightsOf(alias)

/** @deprecated compat:factory-refactor — use `paymentAccessOf(ctx).stripeClient()` */
export const stripeClient = async (ctx: ApiContext): Promise<Stripe> => await paymentAccessOf(ctx).stripeClient()
