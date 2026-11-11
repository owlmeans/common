import { memoHelper } from '@owlmeans/context'
import { UnknownPaygate } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { PAYMENT_PROVIDERS } from '../consts.js'
import { planHelper } from '../plan.js'
import type { PaymentPlan, PaymentProduct } from '../types.js'
import type { Paygate, PaygateRegistry, PaymentProvider, PaymentProvidersService } from './types.js'

export const makePaygateRegistry = (ctx: ApiContext): PaygateRegistry => {
  // One binding per provider instance: a provider replaced under its id is bound anew.
  const bound = new WeakMap<PaymentProvider, Paygate>()

  const providers = (): readonly PaymentProvider[] =>
    (ctx as unknown as { hasService?: (alias: string) => boolean }).hasService?.(PAYMENT_PROVIDERS) === true
      ? ctx.service<PaymentProvidersService>(PAYMENT_PROVIDERS).providers() : []

  const paygateOf = (provider: PaymentProvider): Paygate => {
    let paygate = bound.get(provider)
    if (paygate == null) {
      paygate = provider.bind(ctx)
      bound.set(provider, paygate)
    }

    return paygate
  }

  const find = (id: string): Paygate | null => {
    const provider = providers().find(entry => entry.id === id)

    return provider != null ? paygateOf(provider) : null
  }

  const get = (id: string): Paygate => {
    const paygate = find(id)
    if (paygate == null) {
      throw new UnknownPaygate(id)
    }

    return paygate
  }

  const all = (): Paygate[] => providers().map(paygateOf)

  const forSale = (product: PaymentProduct, plan: PaymentPlan, requested?: string): Paygate[] =>
    all().filter(paygate => (requested == null || paygate.id === requested)
      && planHelper.isSoldThrough(product, plan, paygate.id)
      && (plan.recurring == null || paygate.subscriptions != null))

  return { find, get, all, forSale }
}

/** The paygates of a context — one registry per context. */
export const paygatesOf = memoHelper.oncePer(makePaygateRegistry)
