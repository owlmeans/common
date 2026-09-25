import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { useContext } from '@owlmeans/client'
import { useI18nLib } from '@owlmeans/client-i18n'
import {
  LoginIntent, LoginOutcome, LOGIN_INTENT_QUERY, LOGIN_METHOD_QUERY, LOGIN_NEXT_QUERY,
} from '@owlmeans/client-auth/login'
import type { LoginService } from '@owlmeans/client-auth/login'
import { USER_ID } from '@owlmeans/client-auth'
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
 * It also never runs the authorization machine itself: it forwards to the dispatcher (`next`),
 * which owns that flow, and hands back what the dispatcher issued — see {@link surrogateLoginStep}
 * for why a session already stored in this window is not simply handed back.
 */
/** What a surrogate window opened to SIGN IN does with the session it may already hold. */
export enum SurrogateLoginStep {
  /** Drop the stored session and authenticate afresh through the dispatcher. */
  Forget = 'forget',
  /** Hand the stored session to the opener — there is no dispatcher to authenticate through. */
  Resume = 'resume',
  /** Nothing stored: authenticate through the dispatcher. */
  Authenticate = 'authenticate',
}

/**
 * A sign-in request never reuses the session this window happens to hold.
 *
 * The opener asks for a sign-in only when it has no session its server accepts — and the window it
 * opens does not share its storage: an embedded application's storage is partitioned by the top
 * level site, the popup's is first-party. So the popup can hold a session the server has already
 * REFUSED (its record gone after a restart, revoked, fenced). Handing that back closes the popup
 * at once — a blink — and the opener fails its next request exactly as before, forever, because
 * nothing in the opener can reach the popup's storage to clear it. A fresh round trip costs only
 * redirects while the provider still has a session, and always yields a session the server holds.
 *
 * Only without a dispatcher address is the stored session handed back as it is: there is nothing
 * to authenticate through, and the opener's own 401 handling drops it if it is refused.
 */
export const surrogateLoginStep = (token: string | null | undefined, next: string | null): SurrogateLoginStep => {
  const stored = token != null && token !== ''
  if (!stored) {
    return SurrogateLoginStep.Authenticate
  }

  return next != null && next !== '' ? SurrogateLoginStep.Forget : SurrogateLoginStep.Resume
}

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

      const next = query.get(LOGIN_NEXT_QUERY)
      const step = surrogateLoginStep(token, next)

      if (step === SurrogateLoginStep.Forget) {
        // Dropped from this window's storage only — the web auth service's own clearing path
        // navigates to the dispatcher, and `next` below is exactly where this window goes anyway.
        const auth = context.auth()
        await auth.store().delete(USER_ID)
        auth.token = undefined
        auth.auth = undefined
      }

      if (step === SurrogateLoginStep.Resume && token != null) {
        // Signed in here and nowhere to authenticate afresh: hand what there is to the opener.
        const outcome = await login.resume(token)
        setStage(
          outcome === LoginOutcome.Handled ? SurrogateStage.Handing
            : outcome === LoginOutcome.Orphaned ? SurrogateStage.Orphaned
              : SurrogateStage.Failed
        )
        return
      }

      // The dispatcher owns the authorization round trip, and the provider's callback lands there
      // rather than on this route. The method the user already chose travels with it, so the
      // dispatcher does not ask a second time in a window with no one to ask.
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
