import { appendLogin } from '@owlmeans/client-auth/login'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { makeRedirectLoginPlugin } from './redirect.js'
import { makeSurrogateLoginPlugin } from './surrogate.js'

/**
 * Register the login host and the two browser flows on a context.
 *
 * Called by `makeContext`, so every web app has working login — including a framed one — without
 * registering anything. An app that needs a different mechanic registers its own plugin at a
 * higher priority; it does not replace this.
 */
export const appendWebLogin = <C extends BasicConfig, T extends BasicContext<C>>(ctx: T): T => {
  const service = appendLogin<C, T>(ctx).login()
  service.registerPlugin(makeRedirectLoginPlugin())
  service.registerPlugin(makeSurrogateLoginPlugin())

  return ctx
}
