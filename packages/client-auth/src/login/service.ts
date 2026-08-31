import { createLazyService } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { DEFAULT_ALIAS } from './consts.js'
import { defaultLoginEnv } from './env.js'
import { adoptToken } from './adopt.js'
import { LoginOutcome } from './types.js'
import type { LoginContext, LoginPlugin, LoginService, LoginServiceAppend } from './types.js'

/**
 * Login service = plugin host. It holds a registry of login plugins and, on every facade call,
 * resolves the active plugin by cascade (priority desc, first whose `match(env)` is truthy) and
 * delegates to it.
 *
 * The facade methods stay ordinary writable properties (never getters) so that non-plugin
 * implementations — e.g. a native login service — can keep overriding them directly.
 *
 * It is a LAZY service on purpose. The host carries no async setup, and plugin packages must be
 * able to reach it from an app's `makeContext` — i.e. while the context is still in the Loading
 * stage. `context.service()` throws for an uninitialized non-lazy service, which would make
 * `ensureLoginService` fail exactly where apps are told to call it.
 *
 * `begin` is deliberately NOT `async`. An async facade method defers the plugin's body past a
 * microtask boundary, and a `window.open` that lands after the user gesture has finished being
 * handled is eaten by the popup blocker. The same rule binds every plugin's own `begin`.
 */
export const makeLoginService = (alias: string = DEFAULT_ALIAS): LoginService => {
  const plugins: LoginPlugin[] = []

  const ctx = (): LoginContext => service.ctx as LoginContext

  const service: LoginService = createLazyService<LoginService>(alias, {
    registerPlugin: (plugin: LoginPlugin) => {
      const existing = plugins.findIndex(candidate => candidate.alias === plugin.alias)
      if (existing >= 0) {
        plugins.splice(existing, 1)
      }
      plugins.push(plugin)
      plugins.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    },

    plugin: env => {
      const environment = env ?? defaultLoginEnv()
      const plugin = plugins.find(
        candidate => candidate.match?.(environment, service.ctx as LoginContext | undefined) ?? true
      )
      if (plugin == null) {
        throw new Error('login: no plugin matches the current environment')
      }
      return plugin
    },

    env: () => defaultLoginEnv(),

    enter: () => {
      const env = defaultLoginEnv()
      service.plugin(env).enter?.(ctx(), env)
    },

    begin: request => {
      const env = defaultLoginEnv()

      return service.plugin(env).begin(ctx(), request, env)
    },

    authorize: async url => {
      const env = defaultLoginEnv()

      return await service.plugin(env).authorize(ctx(), url, env)
    },

    complete: async token => {
      const env = defaultLoginEnv()

      return await service.plugin(env).complete(ctx(), token, env)
    },

    adopt: async token => { await adoptToken(ctx(), token) },
  })

  return service
}

/**
 * Idempotently obtain the login service on a context, registering an empty host if none exists
 * yet. Plugin packages call this before `registerPlugin`.
 */
export const ensureLoginService = (ctx: BasicContext<any>): LoginService => {
  if (ctx.hasService(DEFAULT_ALIAS)) {
    return ctx.service<LoginService>(DEFAULT_ALIAS)
  }
  const service = makeLoginService()
  ctx.registerService(service)

  return service
}

/** Register the host and expose it as `context.login()`. */
export const appendLogin = <C extends BasicConfig, T extends BasicContext<C>>(
  ctx: T
): T & LoginServiceAppend => {
  ensureLoginService(ctx)
  const contextual = ctx as T & LoginServiceAppend
  contextual.login = () => ctx.service<LoginService>(DEFAULT_ALIAS)

  return contextual
}

export { LoginOutcome }
