import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { useContext } from '@owlmeans/client'
import { useI18nLib } from '@owlmeans/client-i18n'
import {
  LoginIntent, LoginOutcome, LOGIN_FRESH_QUERY, LOGIN_INTENT_QUERY, LOGIN_METHOD_QUERY,
  LOGIN_NEXT_QUERY,
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
 * It does not run the authorization machine itself either: it forwards to the dispatcher (`next`),
 * which owns that flow.
 *
 * It used to short-circuit that when a session was already present on this origin — hand it back,
 * no provider round trip. That is wrong, and it was the whole of a reported defect. This window is
 * first-party on the application's origin, so what it finds there is whatever the person's own
 * tabs left behind, and a token being present says nothing about the record behind it still
 * existing: `authenticated()` reads storage and decodes an envelope, and no client asks the server.
 * A session that had been revoked, replaced or expired was therefore handed back to a window that
 * had asked for a LOGIN, adopted, and used to fail every call — and the next press of the same
 * button found the same dead token and did it again. Nothing recovered but clearing site data.
 *
 * So an explicit login PRODUCES a session. `fresh` says so to the dispatcher, which skips its own
 * resume for the same reason. The cost is one provider round trip that the provider's own session
 * normally answers without asking the person anything; the gain is that what comes back has just
 * been vouched for, and that signing in as somebody else is possible at all.
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

      // The dispatcher owns the authorization round trip, and the provider's callback lands there
      // rather than on this route. Two things travel with it: the method the user already chose,
      // so the dispatcher does not ask a second time in a window with no one to ask, and `fresh`,
      // which tells it that a session it happens to find here is not the answer to this request.
      const next = query.get(LOGIN_NEXT_QUERY)
      if (next == null || next === '') {
        setStage(SurrogateStage.Gesture)
        return
      }
      const method = query.get(LOGIN_METHOD_QUERY)
      const params = new URLSearchParams()
      if (method != null && method !== '') {
        params.set(LOGIN_METHOD_QUERY, method)
      }
      params.set(LOGIN_FRESH_QUERY, '1')
      window.location.href = `${next}${next.includes('?') ? '&' : '?'}${params.toString()}`
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
