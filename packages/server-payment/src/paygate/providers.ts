import { createLazyService } from '@owlmeans/context'
import { PaygateError } from '@owlmeans/payment'
import { PAYMENT_PROVIDERS } from '../consts.js'
import type { Config, Context } from '../types.js'
import type { PaymentProvider, PaymentProvidersService } from './types.js'

/**
 * The payment providers of a context — a lazy service, so a provider package registers its provider
 * while the application is wired (its `append…` helper, before or after the gateway). A provider
 * registered under an id already taken replaces the earlier one.
 */
export const createPaymentProvidersService = (alias: string = PAYMENT_PROVIDERS): PaymentProvidersService => {
  const registered: PaymentProvider[] = []

  const register = (provider: PaymentProvider): void => {
    if (provider == null || typeof provider.id !== 'string' || provider.id.trim() === '') {
      throw new PaygateError('provider:id')
    }
    const index = registered.findIndex(entry => entry.id === provider.id)
    if (index >= 0) {
      registered[index] = provider
    } else {
      registered.push(provider)
    }
  }

  return createLazyService<PaymentProvidersService>(alias, {
    register,
    provider: id => registered.find(entry => entry.id === id) ?? null,
    providers: () => [...registered],
  }, service => async () => { service.initialized = true })
}

/** Register the payment providers service, once. */
export const appendPaymentProviders = <C extends Config, T extends Context<C>>(
  ctx: T, alias: string = PAYMENT_PROVIDERS,
): T => {
  if (!ctx.hasService(alias)) {
    ctx.registerService(createPaymentProvidersService(alias))
  }

  return ctx
}

/** The payment providers service of a context, registered on first use — what a provider's `append…` registers with. */
export const ensurePaymentProviders = <C extends Config, T extends Context<C>>(
  ctx: T, alias: string = PAYMENT_PROVIDERS,
): PaymentProvidersService => appendPaymentProviders(ctx, alias).service<PaymentProvidersService>(alias)
