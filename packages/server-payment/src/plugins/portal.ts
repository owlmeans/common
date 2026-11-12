import { ENTITLING_STATUSES, INTERNAL_PAYGATE, PortalFlow, PortalUnavailable, UnknownPlan } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { PaygateCustomerRecord, PaymentSubscriptionRecord, PortalLinkOptions } from '../types.js'
import type { Paygate, PortalSessionInput } from '../paygate/types.js'
import type { PortalHelper } from './portal/types.js'
import { paymentAccessOf } from '../access.js'
import { catalogueOf } from '../catalogue.js'
import { planHelper } from '../plan.js'
import { paygatesOf } from '../paygate/registry.js'
import { webhookOf } from './webhook-manager.js'
import { ENTITLING_SORT } from './consts.local.js'

export const makePortalHelper = (ctx: ApiContext): PortalHelper => {
  const access = paymentAccessOf(ctx)

  /** The entity's highest-ranked entitling subscription of a paygate (any paygate but the internal one), or `null`. */
  const entitlingSubscription = async (entityId: string, paygate?: string): Promise<PaymentSubscriptionRecord | null> =>
    await access.subscriptions().load(
      { entityId, paygate: paygate ?? { $ne: INTERNAL_PAYGATE }, status: [...ENTITLING_STATUSES] },
      { sort: [...ENTITLING_SORT] as never },
    )

  /** The paygate a portal opens on and the entity's live customer there. */
  const customerOf = async (
    entityId: string, requested?: string,
  ): Promise<{ paygate: Paygate | null, customer: PaygateCustomerRecord | null }> => {
    const paygates = paygatesOf(ctx)
    const live = async (paygate: Paygate): Promise<PaygateCustomerRecord | null> => {
      const customer = await access.paygateCustomers().byEntity(entityId, paygate.id)
      return customer != null && customer.deletedAt == null ? customer : null
    }
    if (requested != null) {
      const paygate = paygates.find(requested)
      return { paygate, customer: paygate != null ? await live(paygate) : null }
    }
    const subscribed = (await entitlingSubscription(entityId))?.paygate
    const preferred = subscribed != null ? paygates.find(subscribed) : null
    for (const paygate of preferred != null ? [preferred, ...paygates.all().filter(item => item !== preferred)] : paygates.all()) {
      const customer = await live(paygate)
      if (customer != null) {
        return { paygate, customer }
      }
    }

    return { paygate: preferred, customer: null }
  }

  const createPortalLink = async (entityId: string, opts: PortalLinkOptions): Promise<string> => {
    const { paygate, customer } = await customerOf(entityId, opts.paygate)
    if (paygate == null || customer == null) {
      throw new PortalUnavailable('customer')
    }
    const portal = paygate.portal
    if (portal == null) {
      throw new PortalUnavailable('paygate')
    }

    const input: PortalSessionInput = {
      customerId: customer.externalId, flow: opts.flow, returnUrl: opts.returnUrl,
      owner: webhookOf(ctx).gatewayOwnerOf(), deployment: () => webhookOf(ctx).deploymentOf(paygate.id),
    }
    switch (opts.flow) {
      case PortalFlow.Manage:
      case PortalFlow.PaymentMethod:
        break
      case PortalFlow.Cancel:
      case PortalFlow.Update:
      case PortalFlow.Change: {
        const subscription = await entitlingSubscription(entityId, paygate.id)
        if (subscription == null) {
          throw new PortalUnavailable('subscription')
        }
        input.subscriptionId = subscription.externalId
        if (opts.flow === PortalFlow.Change) {
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
          input.itemId = subscription.itemId
          input.lookupKey = planHelper.planLookupKey(product, plan)
        }
        break
      }
      default:
        throw new PortalUnavailable(`flow:${String(opts.flow)}`)
    }

    return await portal.createSession(input)
  }

  return { createPortalLink }
}

/** The customer portal of a context — one per context. */
export const portalOf = memoHelper.oncePer(makePortalHelper)
