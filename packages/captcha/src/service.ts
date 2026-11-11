import { createLazyService, MiddlewareStage, MiddlewareType } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { CAPTCHA_SERVICE } from './consts.js'
import { captchaResolverOf } from './resolver.js'
import type { CaptchaProvider, CaptchaService } from './types.js'

/**
 * The captcha host: the providers of one context by id. It defines what happens without a provider
 * — nothing is verified and nothing passes.
 *
 * A LAZY service on purpose: it carries no async setup, and provider packages reach it from an
 * app's `makeContext`, while the context is still being set up — `context.service()` throws for an
 * uninitialized non-lazy service.
 */
export const createCaptchaService = (alias: string = CAPTCHA_SERVICE): CaptchaService => {
  const providers = new Map<string, CaptchaProvider>()

  const register: CaptchaService['register'] = provider => {
    providers.delete(provider.id)
    providers.set(provider.id, provider)
  }

  const get: CaptchaService['get'] = id => {
    if (id != null && id !== '') {
      return providers.get(id) ?? null
    }

    return providers.size === 1 ? [...providers.values()][0] : null
  }

  const list: CaptchaService['list'] = () => [...providers.values()]

  return createLazyService<CaptchaService>(alias, { register, get, list })
}

/**
 * The captcha host of a context, registered on first use — call it while the context is set up (a
 * provider package's `append*` does). Idempotent. The first call also adds the boot check: a declared
 * `MOD_CAPTCHA` record whose provider is not registered fails the context's initialization.
 */
export const ensureCaptchaService = (context: BasicContext<any>): CaptchaService => {
  if (context.hasService(CAPTCHA_SERVICE)) {
    return context.service<CaptchaService>(CAPTCHA_SERVICE)
  }
  const service = createCaptchaService()
  context.registerService(service)
  context.registerMiddleware({
    type: MiddlewareType.Context,
    stage: MiddlewareStage.Loading,
    apply: async ctx => { captchaResolverOf(ctx).assertReady() },
  })

  return service
}
