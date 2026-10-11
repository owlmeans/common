import { createHash } from 'node:crypto'
import type Stripe from 'stripe'
import { ENTITLING_STATUSES, PortalFlow, PortalUnavailable, ProductError, UnknownPlan } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import {
  FINGERPRINT_PORTAL, STRIPE_DEPLOYMENT_KEY, STRIPE_OWNER_KEY, STRIPE_OWNER_VALUE, STRIPE_PAYGATE_ALIAS,
} from '../consts.js'
import type { PaymentProduct, PaymentSubscriptionRecord, PortalLinkOptions } from '../types.js'
import { log } from '../log.js'
import type { Claim, ConfigurationParams } from './types.local.js'
import type { EnsurePortalOptions, PortalHelper } from './portal/types.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { catalogueOf } from '../catalogue.js'
import { planHelper } from '../plan.js'
import { webhookOf } from './webhook-manager.js'

/** The fingerprint sku of an owner's portal configuration: `portal:<owner>`. */
const portalFingerprintSku = (owner: string): string => `${FINGERPRINT_PORTAL}:${owner}`

/**
 * Whose a configuration is by its metadata: `ours` carries this owner AND this deployment's key;
 * `foreign` is tagged for another deployment or another owner; `unclaimed` names no deployment.
 */
const claimOf = (metadata: Stripe.Metadata | null | undefined, owner: string, deployment: string): Claim => {
  const owned = metadata?.[STRIPE_OWNER_KEY] === STRIPE_OWNER_VALUE
  const tagged = metadata?.[STRIPE_DEPLOYMENT_KEY]
  if (owned && metadata?.service === owner && tagged === deployment) {
    return 'ours'
  }
  if ((owned && metadata?.service !== owner) || (tagged != null && tagged !== '')) {
    return 'foreign'
  }

  return 'unclaimed'
}

export const makePortalHelper = (ctx: ApiContext): PortalHelper => {
  const access = paymentAccessOf(ctx)

  /** The recurring plans sold through Stripe, per product — what the portal may switch between. */
  const recurringCatalog = async (): Promise<Array<{ product: PaymentProduct, lookupKeys: string[], hashable: unknown[] }>> => {
    // The declared tax behavior decides which Stripe price id `sync.ts` keeps for a plan (an
    // in-place `unspecified` update keeps it, an opposite behavior replaces it) — hashed here too,
    // so a behavior change refreshes this configuration's `products[].prices` to the new ids.
    const behavior = (await access.payment().pricingPolicy()).tax.behavior ?? null
    const result: Array<{ product: PaymentProduct, lookupKeys: string[], hashable: unknown[] }> = []
    for (const { product, plans } of await catalogueOf(ctx).stripePlansOf()) {
      const recurring = plans.filter(plan => plan.recurring != null)
      if (recurring.length === 0) {
        continue
      }
      result.push({
        product,
        lookupKeys: recurring.map(plan => planHelper.planLookupKey(product, plan)),
        hashable: recurring.map(plan => ({
          sku: plan.sku, price: plan.price, currency: plan.currency ?? 'usd', interval: plan.recurring?.interval,
          rank: planHelper.planRank(plan), behavior,
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

  const ensurePortalConfiguration = async (stripe: Stripe, opts: EnsurePortalOptions = {}): Promise<string | null> => {
    const owner = webhookOf(ctx).gatewayOwnerOf()
    const deployment = webhookOf(ctx).webhookUrlOf()
    const sku = portalFingerprintSku(owner)
    const branding = await access.portalBrandingConfig()
    const catalog = await recurringCatalog()
    const rights = await access.payment().consumerRightsPolicy()
    // A locked billing country is never edited in the portal: tax follows the saved address.
    const stripeConfig = await access.stripePricingConfig()
    const countryLock = rights?.mechanisms.countryLock === true
    // A pinned country and a locked customer e-mail are the application's: never edited in the portal.
    const countryPin = stripeConfig?.lockCustomerCountry === true
    const emailLock = stripeConfig?.lockCustomerEmail === true
    const regionCurrencies = Object.values(rights?.currencies ?? {}).filter(code => code != null).sort()
    const hash = createHash('sha256').update(JSON.stringify({
      service: owner,
      deployment,
      ...(countryLock ? { countryLock } : {}),
      ...(countryPin ? { countryPin } : {}),
      ...(emailLock ? { emailLock } : {}),
      ...(regionCurrencies.length > 0 ? { regionCurrencies } : {}),
      branding: branding != null ? {
        headline: branding.headline ?? null, privacyPolicyUrl: branding.privacyPolicyUrl ?? null,
        termsOfServiceUrl: branding.termsOfServiceUrl ?? null, returnUrl: branding.returnUrl ?? null,
      } : null,
      products: catalog.map(entry => ({ product: entry.product.sku, plans: entry.hashable })),
    })).digest('hex')

    const stored = await access.fingerprints().bySku(sku)
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
    const metadata = { [STRIPE_OWNER_KEY]: STRIPE_OWNER_VALUE, service: owner, [STRIPE_DEPLOYMENT_KEY]: deployment }
    const allowedUpdates: Stripe.BillingPortal.ConfigurationCreateParams.Features.CustomerUpdate.AllowedUpdate[] = [
      ...(emailLock ? [] : ['email' as const]), ...(countryLock || countryPin ? [] : ['address' as const]), 'tax_id',
    ]
    const params: ConfigurationParams = {
      features: {
        customer_update: { enabled: true, allowed_updates: allowedUpdates },
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
        if (claimOf(current.metadata, owner, deployment) !== 'foreign') {
          await stripe.billingPortal.configurations.update(current.id, params)
          configurationId = current.id
        }
      } catch (error) {
        if (!paymentUtils.isMissingObject(error)) {
          throw error
        }
      }
    }
    if (configurationId == null) {
      const existing = (await listActiveConfigurations(stripe))
        .find(configuration => claimOf(configuration.metadata, owner, deployment) === 'ours')
      if (existing != null) {
        await stripe.billingPortal.configurations.update(existing.id, params)
        configurationId = existing.id
      } else {
        configurationId = (await stripe.billingPortal.configurations.create(params)).id
      }
    }

    const now = new Date()
    if (stored != null) {
      await access.fingerprints().update({ ...stored, hash, externalId: configurationId, updatedAt: now })
    } else {
      await access.fingerprints().create({ sku, hash, externalId: configurationId, updatedAt: now })
    }

    return configurationId
  }

  /** The entity's highest-ranked entitling Stripe subscription, or `null`. */
  const entitlingStripeSubscription = async (
    entityId: string,
  ): Promise<PaymentSubscriptionRecord | null> => await access.subscriptions().load(
    { entityId, paygate: STRIPE_PAYGATE_ALIAS, status: [...ENTITLING_STATUSES] },
    { sort: [{ field: 'rank', order: 'desc' }, { field: 'createdAt', order: 'desc' }] },
  )

  const createPortalLink = async (stripe: Stripe, entityId: string, opts: PortalLinkOptions): Promise<string> => {
    const customer = await access.paygateCustomers().byEntity(entityId, STRIPE_PAYGATE_ALIAS)
    if (customer == null || customer.deletedAt != null) {
      throw new PortalUnavailable('customer')
    }

    const sku = portalFingerprintSku(webhookOf(ctx).gatewayOwnerOf())
    let configuration = (await access.fingerprints().bySku(sku))?.externalId ?? null
    if (configuration == null) {
      await ensurePortalConfiguration(stripe).catch(error => {
        log.error('Portal configuration unavailable', error)
      })
      configuration = (await access.fingerprints().bySku(sku))?.externalId ?? null
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
        const subscription = await entitlingStripeSubscription(entityId)
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
          const plan = await catalogueOf(ctx).findPlan(opts.planSku)
          const product = plan != null ? await catalogueOf(ctx).findProduct(plan.productSku) : null
          if (plan == null || product == null) {
            throw new UnknownPlan(opts.planSku)
          }
          if (subscription.itemId == null) {
            throw new PortalUnavailable('item')
          }
          const lookupKey = planHelper.planLookupKey(product, plan)
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

  return { portalFingerprintSku, ensurePortalConfiguration, createPortalLink }
}

/** The customer portal of a context — one per context. */
export const portalOf = memoHelper.oncePer(makePortalHelper)
