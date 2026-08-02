import { createService } from "@owlmeans/context"
import type { BasicContext } from "@owlmeans/context"
import { DEFAULT_ALIAS } from "./consts.js"
import { defaultRouterEnv } from "./env.js"
import type {
  RouterService, RouterPlugin, UseParamsHook, UseSearchParamsHook
} from "./types.js"

/**
 * Router service = plugin host. It holds a registry of routing plugins and, on
 * every facade call, resolves the active plugin by cascade (priority desc, first
 * whose `match(env)` is truthy) and delegates to it.
 *
 * The facade methods stay ordinary writable properties (never getters) so that
 * non-plugin implementations — e.g. the native router — can keep overriding them
 * directly, exactly as `web-router` did before the plugin model.
 */
export const makeRouterService = (alias: string = DEFAULT_ALIAS): RouterService => {
  const plugins: RouterPlugin[] = []

  const service: RouterService = createService<RouterService>(alias, {
    registerPlugin: plugin => {
      const existing = plugins.findIndex(candidate => candidate.alias === plugin.alias)
      if (existing >= 0) {
        plugins.splice(existing, 1)
      }
      plugins.push(plugin)
      plugins.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    },

    plugin: env => {
      const environment = env ?? defaultRouterEnv()
      const ctx = service.ctx as BasicContext<any> | undefined
      const plugin = plugins.find(candidate => candidate.match?.(environment, ctx) ?? true)
      if (plugin == null) {
        throw new Error('router: no plugin matches the current environment')
      }
      return plugin
    },

    outlet: () => service.plugin().outlet(),

    provider: () => service.plugin().provider(),

    useParams: (() => service.plugin().useParams()) as UseParamsHook,

    useLocation: () => service.plugin().useLocation(),

    useNavigate: () => service.plugin().useNavigate(),

    useSearchParams: ((init?: URLSearchParams | Record<string, string>) =>
      service.plugin().useSearchParams(init)) as UseSearchParamsHook,

    compile: routes => service.plugin().compile(routes, service.ctx as BasicContext<any> | undefined)
  })

  return service
}

/**
 * Idempotently obtain the router service on a context, registering an empty host
 * if none exists yet. Plugin packages call this before `registerPlugin`.
 */
export const ensureRouterService = (ctx: BasicContext<any>): RouterService => {
  if (ctx.hasService(DEFAULT_ALIAS)) {
    return ctx.service<RouterService>(DEFAULT_ALIAS)
  }
  const service = makeRouterService()
  ctx.registerService(service)
  return service
}
