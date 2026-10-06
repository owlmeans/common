import type Stripe from 'stripe'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { StripeBootstrapOptions } from './types.js'
import { log } from './log.js'
import type { StripeBootstrapHelper } from './bootstrap/types.js'
import { productSyncOf } from './sync.js'
import { portalOf } from './plugins/portal.js'
import { webhookOf } from './plugins/webhook-manager.js'

export const makeStripeBootstrapHelper = (ctx: ApiContext): StripeBootstrapHelper => {
  const bootstrapStripe = async (stripe: Stripe, opts: StripeBootstrapOptions = {}): Promise<void> => {
    const steps: Array<[string, () => Promise<unknown>]> = [
      ['products', async () => await productSyncOf(ctx).syncStripeProducts(stripe)],
      ['portal', async () => await portalOf(ctx).ensurePortalConfiguration(stripe, opts)],
      ['webhook', async () => await webhookOf(ctx).ensureWebhookEndpoint(stripe, opts)],
    ]
    for (const [name, step] of steps) {
      try {
        await step()
      } catch (error) {
        log.error('Stripe bootstrap step failed', { step: name, error })
      }
    }
  }

  return { bootstrapStripe }
}

/** The Stripe bootstrap of a context — one per context. */
export const stripeBootstrapOf = memoHelper.oncePer(makeStripeBootstrapHelper)
