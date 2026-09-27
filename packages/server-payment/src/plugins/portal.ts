import { createHash } from 'node:crypto'
import type Stripe from 'stripe'
import {
  ENTITLING_STATUSES, PortalFlow, PortalUnavailable, ProductError, UnknownPlan,
} from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import {
  FINGERPRINT_PORTAL, STRIPE_DEPLOYMENT_KEY, STRIPE_OWNER_KEY, STRIPE_OWNER_VALUE, STRIPE_PAYGATE_ALIAS,
} from '../consts.js'
import { findPlan, findProduct, planRank } from '../plan.js'
import { planLookupKey, stripePlansOf } from '../sync.js'
import {
  fingerprints, isMissingObject, paygateCustomers, payment, portalBrandingConfig, subscriptions,
} from '../utils.js'
import { webhookUrlOf } from './webhook-manager.js'
import type { PaymentProduct, PaymentSubscriptionRecord, PortalLinkOptions } from '../types.js'

type ConfigurationParams = Stripe.BillingPortal.ConfigurationCreateParams

export const portalFingerprintSku = (service: string): string => `${FINGERPRINT_PORTAL}:${service}`

/** The recurring plans sold through Stripe, per product — what the portal may switch between. */
const recurringCatalog = async (ctx: ApiContext): Promise<Array<{ product: PaymentProduct, lookupKeys: string[], hashable: unknown[] }>> => {
  // The declared tax behavior decides which Stripe price id `sync.ts` keeps for a plan (an
  // in-place `unspecified` update keeps it, an opposite behavior replaces it) — hashed here too,
  // so a behavior change refreshes this configuration's `products[].prices` to the new ids.
  const behavior = (await payment(ctx).pricingPolicy()).tax.behavior ?? null
  const result: Array<{ product: PaymentProduct, lookupKeys: string[], hashable: unknown[] }> = []
  for (const { product, plans } of await stripePlansOf(ctx)) {
    const recurring = plans.filter(plan => plan.recurring != null)
    if (recurring.length === 0) {
      continue
    }
    result.push({
      product,
      lookupKeys: recurring.map(plan => planLookupKey(product, plan)),
      hashable: recurring.map(plan => ({
        sku: plan.sku, price: plan.price, currency: plan.currency ?? 'usd', interval: plan.recurring?.interval,
        rank: planRank(plan), behavior,
        // A changed currency option replaces the Price — the portal's price list must follow it.
        ...(plan.currencyPrices != null ? { currencyPrices: plan.currencyPrices } : {}),
      })).sort((a, b) => a.sku.localeCompare(b.sku)),
    })
  }

  return result.sort((a, b) => a.product.sku.localeCompare(b.product.sku))
}

const activeRecurringPrices = async (stripe: Stripe, productSku: string): Promise<Stripe.Price[]> =>
  (await stripe.prices.list({ product: productSku, active: true, limit: 100 })).data
    .filter(price => price.recurring != null)

export interface EnsurePortalOptions {
  force?: boolean
}

type Claim = 'ours' | 'foreign' | 'unclaimed'

/**
 * Whose a configuration is by its metadata: `ours` carries this service AND this deployment's key;
 * `foreign` is tagged for another deployment or another service; `unclaimed` names no deployment.
 */
const claimOf = (metadata: Stripe.Metadata | null | undefined, service: string, deployment: string): Claim => {
  const owned = metadata?.[STRIPE_OWNER_KEY] === STRIPE_OWNER_VALUE
  const tagged = metadata?.[STRIPE_DEPLOYMENT_KEY]
  if (owned && metadata?.service === service && tagged === deployment) {
    return 'ours'
  }
  if ((owned && metadata?.service !== service) || (tagged != null && tagged !== '')) {
    return 'foreign'
  }

  return 'unclaimed'
}

const listActiveConfigurations = async (stripe: Stripe): Promise<Stripe.BillingPortal.Configuration[]> => {
  const configurations: Stripe.BillingPortal.Configuration[] = []
  let startingAfter: string | undefined
  for (;;) {
    const page = await stripe.billingPortal.configurations.list({
      active: true, limit: 100, ...(startingAfter != null ? { starting_after: startingAfter } : {}),
    })
    configurations.push(...page.data)
    if (!page.has_more || page.data.length === 0) {
      return configurations
    }
    startingAfter = page.data[page.data.length - 1].id
  }
}

/**
 * Keep this deployment's own Stripe customer-portal configuration: customer, invoice and payment
 * method self-service, cancellation at period end, and switching between the active recurring
 * prices of every product sold through Stripe (both subscription features off when there are none).
 *
 * A deployment's identity is its webhook URL (`webhookUrlOf`) — also when that URL is undeliverable,
 * as on a local run. Several deployments of one service may share a Stripe account, so each owns a
 * configuration of its own, tagged `{ owlmeans: 'payment', service, deployment: <webhook URL> }`.
 *
 * - An unchanged declaration (catalogue, branding, deployment key) makes no paygate call.
 * - The configuration the `portal:<service>` fingerprint row names is updated in place — unless its
 *   metadata tags it for another deployment, which is never overwritten; this deployment then
 *   proceeds as though it held no row.
 * - Without a usable row, an active configuration tagged with exactly this service and deployment
 *   key is adopted. Nothing else is: not an untagged one, not one carrying only the service label,
 *   not one tagged for another deployment.
 * - Otherwise a new configuration is created. Stripe cannot delete a portal configuration, so one
 *   this deployment can no longer identify stays in the account, and a lost row creates a new one
 *   unless its tagged configuration is found.
 */
export const ensurePortalConfiguration = async (
  ctx: ApiContext, stripe: Stripe, opts: EnsurePortalOptions = {},
): Promise<string | null> => {
  const service = ctx.cfg.service
  const deployment = webhookUrlOf(ctx)
  const sku = portalFingerprintSku(service)
  const branding = await portalBrandingConfig(ctx)
  const catalog = await recurringCatalog(ctx)
  const rights = await payment(ctx).consumerRightsPolicy()
  // A locked billing country is never edited in the portal: tax follows the saved address.
  const countryLock = rights?.mechanisms.countryLock === true
  const regionCurrencies = Object.values(rights?.currencies ?? {}).filter(code => code != null).sort()
  const hash = createHash('sha256').update(JSON.stringify({
    service,
    deployment,
    ...(countryLock ? { countryLock } : {}),
    ...(regionCurrencies.length > 0 ? { regionCurrencies } : {}),
    branding: branding != null ? {
      headline: branding.headline ?? null, privacyPolicyUrl: branding.privacyPolicyUrl ?? null,
      termsOfServiceUrl: branding.termsOfServiceUrl ?? null, returnUrl: branding.returnUrl ?? null,
    } : null,
    products: catalog.map(entry => ({ product: entry.product.sku, plans: entry.hashable })),
  })).digest('hex')

  const stored = await fingerprints(ctx).bySku(sku)
  if (stored != null && stored.hash === hash && stored.externalId != null && opts.force !== true) {
    return stored.externalId
  }

  const products: Array<{ product: string, prices: string[] }> = []
  for (const entry of catalog) {
    const prices = (await activeRecurringPrices(stripe, entry.product.sku)).map(price => price.id)
    if (prices.length > 0) {
      products.push({ product: entry.product.sku, prices })
    }
  }
  const cancelable = catalog.length > 0
  const switchable = products.length > 0
  const metadata = { [STRIPE_OWNER_KEY]: STRIPE_OWNER_VALUE, service, [STRIPE_DEPLOYMENT_KEY]: deployment }
  const params: ConfigurationParams = {
    features: {
      customer_update: {
        enabled: true, allowed_updates: countryLock ? ['email', 'tax_id'] : ['email', 'address', 'tax_id'],
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: cancelable
        ? { enabled: true, mode: 'at_period_end', proration_behavior: 'none' }
        : { enabled: false },
      subscription_update: switchable
        ? {
          enabled: true, default_allowed_updates: ['price'], products,
          proration_behavior: 'create_prorations',
        }
        : { enabled: false },
    },
    ...(branding != null ? {
      business_profile: {
        ...(branding.headline != null ? { headline: branding.headline } : {}),
        ...(branding.privacyPolicyUrl != null ? { privacy_policy_url: branding.privacyPolicyUrl } : {}),
        ...(branding.termsOfServiceUrl != null ? { terms_of_service_url: branding.termsOfServiceUrl } : {}),
      },
      default_return_url: branding.returnUrl,
    } : {}),
    metadata,
  }

  let configurationId: string | null = null
  if (stored?.externalId != null) {
    try {
      const current = await stripe.billingPortal.configurations.retrieve(stored.externalId)
      if (claimOf(current.metadata, service, deployment) !== 'foreign') {
        await stripe.billingPortal.configurations.update(current.id, params)
        configurationId = current.id
      }
    } catch (error) {
      if (!isMissingObject(error)) {
        throw error
      }
    }
  }
  if (configurationId == null) {
    const existing = (await listActiveConfigurations(stripe))
      .find(configuration => claimOf(configuration.metadata, service, deployment) === 'ours')
    if (existing != null) {
      await stripe.billingPortal.configurations.update(existing.id, params)
      configurationId = existing.id
    } else {
      configurationId = (await stripe.billingPortal.configurations.create(params)).id
    }
  }

  const now = new Date()
  if (stored != null) {
    await fingerprints(ctx).update({ ...stored, hash, externalId: configurationId, updatedAt: now })
  } else {
    await fingerprints(ctx).create({ sku, hash, externalId: configurationId, updatedAt: now })
  }

  return configurationId
}

/** The entity's highest-ranked entitling Stripe subscription, or `null`. */
const entitlingStripeSubscription = async (
  ctx: ApiContext, entityId: string,
): Promise<PaymentSubscriptionRecord | null> => await subscriptions(ctx).load(
  { entityId, paygate: STRIPE_PAYGATE_ALIAS, status: [...ENTITLING_STATUSES] },
  { sort: [{ field: 'rank', order: 'desc' }, { field: 'createdAt', order: 'desc' }] },
)

/**
 * A Stripe customer-portal session for one entity. `Manage` opens the portal home and
 * `PaymentMethod` the payment method form; `Cancel`, `Update` and `Change` act on the entity's
 * entitling Stripe subscription (`Change` confirms a switch of its one item to `planSku`'s price).
 *
 * @throws PortalUnavailable('customer' | 'subscription' | 'plan' | 'item')
 */
export const createPortalLink = async (
  ctx: ApiContext, stripe: Stripe, entityId: string, opts: PortalLinkOptions,
): Promise<string> => {
  const customer = await paygateCustomers(ctx).byEntity(entityId, STRIPE_PAYGATE_ALIAS)
  if (customer == null || customer.deletedAt != null) {
    throw new PortalUnavailable('customer')
  }

  const sku = portalFingerprintSku(ctx.cfg.service)
  let configuration = (await fingerprints(ctx).bySku(sku))?.externalId ?? null
  if (configuration == null) {
    await ensurePortalConfiguration(ctx, stripe).catch(error => {
      console.error('[payment] portal configuration unavailable', error)
    })
    configuration = (await fingerprints(ctx).bySku(sku))?.externalId ?? null
  }

  let flowData: Stripe.BillingPortal.SessionCreateParams.FlowData | undefined
  switch (opts.flow) {
    case PortalFlow.Manage:
      break
    case PortalFlow.PaymentMethod:
      flowData = { type: 'payment_method_update' }
      break
    case PortalFlow.Cancel:
    case PortalFlow.Update:
    case PortalFlow.Change: {
      const subscription = await entitlingStripeSubscription(ctx, entityId)
      if (subscription == null) {
        throw new PortalUnavailable('subscription')
      }
      if (opts.flow === PortalFlow.Cancel) {
        flowData = { type: 'subscription_cancel', subscription_cancel: { subscription: subscription.externalId } }
      } else if (opts.flow === PortalFlow.Update) {
        flowData = { type: 'subscription_update', subscription_update: { subscription: subscription.externalId } }
      } else {
        if (opts.planSku == null || opts.planSku === '') {
          throw new PortalUnavailable('plan')
        }
        const plan = await findPlan(ctx, opts.planSku)
        const product = plan != null ? await findProduct(ctx, plan.productSku) : null
        if (plan == null || product == null) {
          throw new UnknownPlan(opts.planSku)
        }
        if (subscription.itemId == null) {
          throw new PortalUnavailable('item')
        }
        const lookupKey = planLookupKey(product, plan)
        const [price] = (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })).data
        if (price == null) {
          throw new ProductError(`price:${lookupKey}`)
        }
        flowData = {
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: subscription.externalId,
            items: [{ id: subscription.itemId, price: price.id, quantity: 1 }],
          },
        }
      }
      break
    }
    default:
      throw new PortalUnavailable(`flow:${String(opts.flow)}`)
  }
  if (flowData != null) {
    flowData.after_completion = { type: 'redirect', redirect: { return_url: opts.returnUrl } }
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customer.externalId,
    return_url: opts.returnUrl,
    ...(configuration != null ? { configuration } : {}),
    ...(flowData != null ? { flow_data: flowData } : {}),
  })

  return session.url
}

