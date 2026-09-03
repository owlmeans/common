import { useEffect, useState } from 'react'
import { useContext } from '@owlmeans/client'
import type { AppConfig, AppContext } from './types.js'

export const extractPrimaryHost = <C extends AppConfig = AppConfig, T extends AppContext<C> = AppContext<C>>(context: T) => {
  if (typeof window !== 'undefined') {
    context.cfg.primaryHost = window.location.hostname
    context.cfg.primaryPort = window.location.port != null && window.location.port != '' ? parseInt(window.location.port) : undefined
  }
}

/**
 * Whether this browsing context currently holds a session — the flag a screen renders against
 * when it offers "Log in" or "Log out", a profile menu, or an authenticated-only panel.
 *
 * It reads the one channel the rest of the package reads, `context.auth().authenticated()`, which
 * answers from the auth service's token or, in a cold document, rehydrates it from the auth
 * resource. Nothing here touches storage or decodes a token: a second way to ask the same question
 * is a second thing to keep in step with logout.
 *
 * The answer is `false` until that promise settles and is not re-checked afterwards, because both
 * transitions out of the current answer replace the document — signing in navigates through the
 * dispatcher, and `auth().update(undefined)` assigns `document.location.href`. There is no in-page
 * change to subscribe to.
 *
 * This reports; it does not guard. `useSelfAuth` from `@owlmeans/client-auth` is the guard — it
 * sends an anonymous visitor to the dispatcher, which is the wrong behaviour for a component that
 * only wants to know which control to draw.
 */
export const useAuthenticated = (): boolean => {
  const context = useContext<AppConfig, AppContext>()
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let mounted = true
    void context.auth().authenticated().then(token => {
      if (mounted) {
        setAuthenticated(token != null && token !== '')
      }
    })

    return () => { mounted = false }
  }, [])

  return authenticated
}
