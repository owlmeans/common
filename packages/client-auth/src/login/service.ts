import { createLazyService } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { CommonConfig } from '@owlmeans/config'
import { DEFAULT_ALIAS } from './consts.js'
import { defaultLoginEnv } from './env.js'
import { adoptToken, revokeToken } from './adopt.js'
import { resolveLoginMethods } from './methods.js'
import { LoginOutcome } from './types.js'
import type {
  LoginContext, LoginMethodSource, LoginPlugin, LoginPrecondition, LoginScreenComponent,
  LoginService, LoginServiceAppend
} from './types.js'

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
 * `begin` and `logout` are deliberately NOT `async`. An async facade method defers the plugin's
 * body past a microtask boundary, and a `window.open` that lands after the user gesture has
 * finished being handled is eaten by the popup blocker. The same rule binds every plugin's own
 * `begin` and `logout`, and it is why a precondition must be synchronous too.
 */
export const makeLoginService = (alias: string = DEFAULT_ALIAS): LoginService => {
  const plugins: LoginPlugin[] = []
  const preconditions: LoginPrecondition[] = []
  const methodSources: LoginMethodSource[] = []
  let screen: LoginScreenComponent | null = null

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

    registerPrecondition: (precondition: LoginPrecondition) => {
      const existing = preconditions.findIndex(candidate => candidate.alias === precondition.alias)
      if (existing >= 0) {
        preconditions.splice(existing, 1)
      }
      preconditions.push(precondition)
      preconditions.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    },

    registerMethodSource: (source: LoginMethodSource) => {
      const existing = methodSources.findIndex(candidate => candidate.alias === source.alias)
      if (existing >= 0) {
        methodSources.splice(existing, 1)
      }
      methodSources.push(source)
    },

    methods: methodCtx => resolveLoginMethods(
      methodCtx,
      (methodCtx.context.cfg as CommonConfig).security?.auth?.login,
      methodSources
    ),

    registerScreen: value => { screen = value },

    screen: () => screen,

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
      // Synchronously, before anything can open a window: a precondition that refuses leaves the
      // user exactly where `Gesture` describes — unable to proceed until they act again.
      for (const precondition of preconditions) {
        if (!precondition.check(ctx(), request, env)) {
          return Promise.resolve(LoginOutcome.Gesture)
        }
      }

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

    resume: async token => {
      const env = defaultLoginEnv()
      // Absent means "keep it and carry on" — which is what an ordinary tab has always done, and
      // is why the redirect plugin implements nothing here.
      return await service.plugin(env).resume?.(ctx(), token, env) ?? LoginOutcome.Passed
    },

    logout: request => {
      const env = defaultLoginEnv()
      const plugin = service.plugin(env)
      if (plugin.logout == null) {
        // A plugin with no logout mechanic still has to end the session it started.
        return revokeToken(ctx()).then(async () => {
          await request.navigate?.()

          return LoginOutcome.Passed
        })
      }

      return plugin.logout(ctx(), request, env)
    },

    logoutComplete: async () => {
      const env = defaultLoginEnv()

      return await service.plugin(env).logoutComplete?.(ctx(), env) ?? LoginOutcome.Passed
    },

    adopt: async token => { await adoptToken(ctx(), token) },

    revoke: async () => { await revokeToken(ctx()) },
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
