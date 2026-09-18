import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { useContext } from '@owlmeans/client'
import { useI18nLib } from '@owlmeans/client-i18n'
import {
  LoginIntent, LoginOutcome, LOGIN_INTENT_QUERY, LOGIN_METHOD_QUERY, LOGIN_NEXT_QUERY,
} from '@owlmeans/client-auth/login'
import type { LoginService } from '@owlmeans/client-auth/login'
import type { AppContext } from '../types.js'
import { LoginSurrogateView, SurrogateStage } from './view.js'

/**
 * The login window an embedded application opens one level up.
 *
 * It is NOT wrapped in `DispatcherHOC`, and that is the point: the HOC's continuation navigates to
 * `HOME` when it has nothing else to do, which is how a popup ended up rendering the whole
 * application, with its navigation, inside itself. This screen has no continuation at all — it
 * either hands something back and closes, or it says what it is waiting for.
 *
 * It also never runs the authorization machine. When there is already a session here, that is the
 * answer, and it goes back to the opener immediately — no provider round trip, no PKCE exchange.
 * When there is not, it forwards to the dispatcher (`next`), which owns that flow.
 */
export const SurrogateScreen: FC = () => {
  const context = useContext() as unknown as AppContext
  const [query] = context.router().useSearchParams()
  const t = useI18nLib('auth')

  const intent = query.get(LOGIN_INTENT_QUERY) === LoginIntent.Logout
    ? LoginIntent.Logout
    : LoginIntent.Login

  const [stage, setStage] = useState<SurrogateStage>(SurrogateStage.Working)
  const [error, setError] = useState<string | undefined>()

  const onAction = useCallback(() => {
    if (stage === SurrogateStage.Standalone) {
      window.location.href = '/'
      return
    }
    if (stage === SurrogateStage.Gesture) {
      const next = query.get(LOGIN_NEXT_QUERY)
      void context.login().begin({ url: next ?? window.location.href })
      return
    }
    window.close()
  }, [context, stage, query])

  useEffect(() => {
    const login = context.service<LoginService>('login-service')
    // First statement, unconditionally: `markSurrogate` reads `window.name`, and the browser
    // clears that the moment this window's top-level context goes cross-origin. Recording it
    // later means recording nothing.
    login.enter()

    const env = login.env()
    if (!env.surrogate) {
      // Somebody opened this address directly, or the window lost its marker. Never navigate on
      // its behalf — offer a link and stop.
      setStage(env.embedded ? SurrogateStage.Gesture : SurrogateStage.Standalone)
      return
    }

    const run = async (): Promise<void> => {
      const token = await context.auth().authenticated()

      if (intent === LoginIntent.Logout) {
        // Revoked FIRST, before anything can be awaited on a channel that may never answer: a
        // window the user closes half a second later must still have ended the session it opened
        // to end.
        await login.revoke()
        const outcome = await login.logoutComplete()
        setStage(
          outcome === LoginOutcome.Handled ? SurrogateStage.Handing
            : outcome === LoginOutcome.Orphaned ? SurrogateStage.Orphaned
              : SurrogateStage.Failed
        )
        return
      }

      if (token != null && token !== '') {
        // Already signed in here. The framed application is the one that asked, so the session
        // goes to it rather than being displayed to this window.
        const outcome = await login.resume(token)
        setStage(
          outcome === LoginOutcome.Handled ? SurrogateStage.Handing
            : outcome === LoginOutcome.Orphaned ? SurrogateStage.Orphaned
              : SurrogateStage.Failed
        )
        return
      }

      // Nothing here yet — the dispatcher owns the authorization round trip, and the provider's
      // callback lands there rather than on this route. The method the user already chose travels
      // with it, so the dispatcher does not ask a second time in a window with no one to ask.
      const next = query.get(LOGIN_NEXT_QUERY)
      if (next == null || next === '') {
        setStage(SurrogateStage.Gesture)
        return
      }
      const method = query.get(LOGIN_METHOD_QUERY)
      const target = method != null && method !== ''
        ? `${next}${next.includes('?') ? '&' : '?'}${LOGIN_METHOD_QUERY}=${encodeURIComponent(method)}`
        : next
      window.location.href = target
    }

    void run().catch((e: Error) => {
      console.error(e)
      setError(e.message)
      setStage(SurrogateStage.Failed)
    })
  }, [context, intent])

  return <LoginSurrogateView
    stage={stage} intent={intent} onAction={onAction} error={error}
    translate={(key, defaultValue) => t(key, { defaultValue })}
  />
}
