import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { ensureRouterService } from '@owlmeans/router'
import { makeReactRouterPlugin } from './plugin.js'

/**
 * Register the react-router plugin on a context. It registers at a higher
 * priority than the default OwlMeans browser plugin, so calling this from an
 * app's `makeContext` switches routing to react-router.
 */
export const appendReactRouter = <C extends BasicConfig, T extends BasicContext<C>>(ctx: T): T => {
  const service = ensureRouterService(ctx)
  service.registerPlugin(makeReactRouterPlugin())
  return ctx
}
