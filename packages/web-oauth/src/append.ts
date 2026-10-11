import { FLOW_STATE } from '@owlmeans/client-flow'
import type { ClientContext } from '@owlmeans/client-context'
import type { ClientConfig } from '@owlmeans/client-context'

/**
 * Fail fast when the one precondition these screens actually depend on is missing, rather than
 * deep inside `suspendFlow` the first time somebody who is not signed in opens a consent screen.
 *
 * There is nothing else to register here: the three screens are bound through `oauthEntrypoints`
 * (spread into the application's own entrypoint list, exactly like every other screen package in
 * this framework), and the translations register themselves as a side effect of importing this
 * package's barrel — `appendOAuthScreens` is the documented call an application makes, but the
 * strings are already there whether it is called or not.
 */
export const appendOAuthScreens = <C extends ClientConfig, T extends ClientContext<C>>(context: T): T => {
  if (!context.hasResource(FLOW_STATE)) {
    throw new SyntaxError(
      'web-oauth: no FLOW_STATE resource registered. Call appendFlowService (@owlmeans/web-flow) — '
      + 'or whatever registers it in this app\'s makeContext — before appendOAuthScreens.'
    )
  }

  return context
}
