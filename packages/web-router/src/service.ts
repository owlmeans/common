import type { BasicConfig, BasicContext } from "@owlmeans/context"
import type { RouterService } from "@owlmeans/router"
import { ensureRouterService, makeRouterService } from "@owlmeans/router"
import { makeBrowserRouterPlugin } from "./browser/plugin.js"

/**
 * Build a router service pre-loaded with the OwlMeans browser plugin. Kept for
 * back-compat; prefer `appendWebRouter` which reuses an existing host.
 */
export const makeWebRouterService = (): RouterService => {
  const service = makeRouterService()
  service.registerPlugin(makeBrowserRouterPlugin())
  return service
}

/**
 * Register the OwlMeans in-browser routing plugin as the default on a context.
 * Idempotent w.r.t. the router host — if another plugin (e.g. react-router) is
 * already registered, this one is added alongside and selected by the cascade.
 */
export const appendWebRouter = <C extends BasicConfig, T extends BasicContext<C>>(ctx: T): T => {
  const service = ensureRouterService(ctx)
  service.registerPlugin(makeBrowserRouterPlugin())
  return ctx
}
