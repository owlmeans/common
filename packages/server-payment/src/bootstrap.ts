import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { PaygateBootstrapOptions } from './types.js'
import type { Paygate } from './paygate/types.js'
import { log } from './log.js'
import type { PaygateBootstrapHelper } from './bootstrap/types.js'
import { productSyncOf } from './sync.js'
import { paygatesOf } from './paygate/registry.js'
import { webhookOf } from './plugins/webhook-manager.js'

export const makePaygateBootstrapHelper = (ctx: ApiContext): PaygateBootstrapHelper => {
  const bootstrapPaygate = async (paygate: Paygate, opts: PaygateBootstrapOptions = {}): Promise<void> => {
    const steps: Array<[string, () => Promise<unknown>]> = [
      ...(paygate.catalogue != null
        ? [['products', async () => await productSyncOf(ctx).syncProducts(paygate)] as [string, () => Promise<unknown>]] : []),
      ...(paygate.portal != null
        ? [['portal', async () => await paygate.portal?.ensureConfiguration(webhookOf(ctx).deploymentOf(paygate.id), opts)] as [string, () => Promise<unknown>]]
        : []),
      ...(paygate.webhook != null
        ? [['webhook', async () => await webhookOf(ctx).ensureWebhookEndpoint(paygate, opts)] as [string, () => Promise<unknown>]] : []),
    ]
    for (const [name, step] of steps) {
      try {
        await step()
      } catch (error) {
        log.error('Paygate bootstrap step failed', { step: name, paygate: paygate.id, error })
      }
    }
  }

  const bootstrap = async (opts: PaygateBootstrapOptions = {}): Promise<void> => {
    for (const paygate of paygatesOf(ctx).all()) {
      await bootstrapPaygate(paygate, opts)
    }
  }

  return { bootstrap, bootstrapPaygate }
}

/** The paygate bootstrap of a context — one per context. */
export const paygateBootstrapOf = memoHelper.oncePer(makePaygateBootstrapHelper)
