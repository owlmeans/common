import { CAUTHEN_AUTHEN_TYPED } from '@owlmeans/auth'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { DEFAULT_METHOD_ORDER, LOGIN_SERVICE } from '../../login/consts.js'
import type { LoginMethod, LoginMethodContext, LoginMethodSource, LoginService } from '../../login/types.js'
import type { AuthenticationPlugin } from './types.js'
import { listAuthPlugins } from './registry.js'

/**
 * Whether a registered plugin may be put on the sign-in screen of THIS application.
 *
 * The registry is global and is filled by side-effect imports, so "registered" means only that
 * some module was pulled into the bundle — three separate reasons why that is not enough:
 *
 * 1. No `method`: `re-captcha` is a STEP inside another flow, not a way to sign in.
 * 2. No renderer: a plugin that declares `requiresRenderer` throws the moment its screen mounts
 *    unless a UI package (`web-panel`, `mui-panel`) assigned one. An app that imported the plugin
 *    host without that package would be offering buttons whose only outcome is a broken page.
 * 3. Not wired: a plugin whose flow needs a service its context never appended fails on the
 *    lookup instead. Packages register their plugins in groups, so an app that wanted one of them
 *    gets the rest too, and the rest have to be able to say they do not apply here.
 */
const offerable = (plugin: AuthenticationPlugin, ctx: LoginMethodContext): boolean => {
  if (plugin.method == null || plugin.method.hidden === true) {
    return false
  }
  if (plugin.requiresRenderer === true && plugin.Renderer == null) {
    return false
  }

  return plugin.method.available?.(ctx) !== false
}

/**
 * Every registered authentication plugin that declares itself offerable, as a sign-in method.
 */
export const pluginMethodSource: LoginMethodSource = {
  alias: 'authentication-plugins',

  list: ctx => listAuthPlugins()
    .filter(plugin => offerable(plugin, ctx))
    .map((plugin): LoginMethod => {
      const meta = plugin.method!
      const type = plugin.type
      const id = meta.id ?? type

      return {
        id, type,
        ...(meta.label != null ? { label: meta.label } : {}),
        i18nKey: meta.i18nKey ?? id,
        ...(meta.icon != null ? { icon: meta.icon } : {}),
        order: meta.order ?? DEFAULT_METHOD_ORDER,
        ...(meta.emphasis != null ? { emphasis: meta.emphasis } : {}),
        ...(meta.restricted === true ? { restricted: true } : {}),
        params: { type },

        // Non-async through the whole chain: `login.begin` opens the surrogate window in its first
        // statement, and a window opened after the gesture has been handled is blocked.
        start: methodCtx => {
          const login = methodCtx.context.service<LoginService>(LOGIN_SERVICE)
          const entrypoint = methodCtx.context.entrypoint<ClientEntrypoint>(CAUTHEN_AUTHEN_TYPED)
          const url = entrypoint.getPath().replace(':type', encodeURIComponent(type))

          return login.begin({
            url,
            // In an ordinary tab this keeps the application mounted, exactly as the pre-chooser
            // dispatcher did; the surrogate plugin ignores it and opens a window instead.
            ...(methodCtx.navigate != null
              ? { navigate: () => methodCtx.navigate?.(CAUTHEN_AUTHEN_TYPED, { type }) }
              : {}),
          })
        },
      }
    }),
}
