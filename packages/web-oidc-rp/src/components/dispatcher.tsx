
import { DispatcherHOC } from '@owlmeans/client-auth'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useContext } from '@owlmeans/web-client'
import { LoginSurrogateView, SurrogateStage } from '@owlmeans/web-client'
import { useI18nLib } from '@owlmeans/client-i18n'
import { AUTH_QUERY } from '@owlmeans/auth'
import { OIDC_ERROR_DESCRIPTION_QUERY, OIDC_ERROR_QUERY } from '@owlmeans/oidc'
import { useFlow } from '@owlmeans/web-flow'
import { OidcAuthService } from '../types.js'
import { DEFAULT_ALIAS } from '../consts.js'
import {
  FallbackLoginScreen, LoginIntent, LoginOutcome, ResumeAction, resumeAction, LOGIN_METHOD_QUERY,
  enterOidcAuthorization,
} from '@owlmeans/client-auth/login'

export const Dispatcher = DispatcherHOC(({ provideToken, navigate }) => {
  const context = useContext()
  const [query] = context.router().useSearchParams()
  const client = useFlow()

  const t = useI18nLib('auth', 'dispatcher')
  const tAuth = useI18nLib('auth')

  // The provider reports a failed authorization by redirecting BACK here with `error` set. Re-entering
  // the flow at that point sends the browser into the very authorization request that just failed —
  // an endless dispatcher <-> provider redirect loop that also hides the reason. Surface it, stop.
  const error = query.get(OIDC_ERROR_QUERY)
  const errorDescription = query.get(OIDC_ERROR_DESCRIPTION_QUERY)

  // `client` (from useFlow/useValue) is not guaranteed referentially stable across renders that
  // don't change its own deps, so this effect can re-run more than once for the same incoming
  // `code`. The exchange is not safe to repeat — the PKCE verifier is single-use (deleted on the
  // first successful read) and the authorization code itself is single-use at the provider — so a
  // second run always fails (`resource:unknown-record`) even though the first one succeeded. Guard
  // it explicitly rather than relying on the effect only firing once.
  const dispatchedRef = useRef(false)

  // Read in the component body, not in the effect. `window.name` is set by `window.open` before
  // this document loads, and after the provider round trip `sessionStorage` carries the marker —
  // so the answer is already right at first paint, and a popup never flashes the application
  // before an effect corrects it.
  const [env] = useState(() => context.login().env())

  // What the login service said about this document, when it said anything the user must see.
  // `Gesture` — authorization needs a user gesture this effect does not have. `Orphaned` — signed
  // in, with no channel back to the window that started it.
  const [outcome, setOutcome] = useState<LoginOutcome | null>(null)
  // Nothing to return from, and nobody signed in: offer the choice. Never start a flow.
  const [choose, setChoose] = useState(false)

  const onLogin = useCallback(() => {
    // Replays this very URL through the login service from inside the gesture, keeping whatever
    // flow parameters the address already carries.
    void context.login().begin({ url: window.location.href }).then(async result => {
      if (result === LoginOutcome.Handled) {
        await navigate()
      }
    })
  }, [context, navigate])

  useEffect(() => {
    // First statement in the effect on purpose: everything below can navigate this window to the
    // provider, and after that the evidence of what this window is would be gone.
    context.login().enter()

    if (client == null) {
      return
    }
    if (error != null) {
      console.error(`[oidc] authorization failed: ${error}${errorDescription != null ? ` — ${errorDescription}` : ''}`)
      return
    }
    if (dispatchedRef.current) {
      return
    }
    dispatchedRef.current = true

    const token = query.get(AUTH_QUERY)
    const params: Record<string, string> = {}
    query.forEach((value, key) => {
      if (key !== AUTH_QUERY) {
        params[key] = value
      }
    })

    if (token != null) {
      // This is required for compatibility with a standard OwlMeans Auth flow.
      provideToken({ token }, params)
    } else {
      const oidc = context.service<OidcAuthService>(DEFAULT_ALIAS)
      oidc.dispatch(params).then(async dispatched => {
        if (dispatched) {
          // A token was issued in this document. Where it belongs is the login service's call: in
          // an ordinary tab it stays here, in a surrogate window it is handed back to the opener,
          // whose storage partition cannot see it.
          const completed = await context.login().complete(context.auth().token ?? '')
          if (completed === LoginOutcome.Handled) {
            return
          }
          if (completed === LoginOutcome.Orphaned) {
            setOutcome(LoginOutcome.Orphaned)
            return
          }
          return await navigate()
        }
        if (client == null) {
          return
        }

        // A choice the user already made, one window up, travels as `?method=`. Acting on it is
        // not choosing for them.
        const chosen = query.get(LOGIN_METHOD_QUERY)
        if (chosen == null || chosen === '') {
          const authzToken = await context.auth().authenticated()
          if (authzToken == null || authzToken === '') {
            // Nothing to return from and nobody signed in. This is where the old code started an
            // authorization request on its own; it now renders the choice instead.
            setChoose(true)

            return
          }
          // A session already exists in THIS document. Whether it is useful here, or belongs to
          // the window that opened this one, is the plugin's call — the dispatcher reads no
          // environment of its own.
          const settled = await context.login().resume(authzToken)
          switch (resumeAction(settled)) {
            case ResumeAction.Stop:
              return
            case ResumeAction.Render:
              setOutcome(settled)

              return
            default:
              return await navigate()
          }
        }

        // Same requirement the chooser's method has: the flow is booted at its first step, and
        // `authenticate` answers only from the step an authorization request can be made from.
        const redirect = await oidc.authenticate(enterOidcAuthorization(client.flow()), params)
        if (redirect != null && redirect !== '') {
          const authorized = await context.login().authorize(redirect)
          if (authorized === LoginOutcome.Gesture) {
            setOutcome(LoginOutcome.Gesture)
          }
          return
        }
        const authzToken = await context.auth().authenticated()
        if (authzToken == null) {
          provideToken({ token: '' }, undefined)
        } else {
          await navigate()
        }
      })
    }
  }, [client, error])

  // A surrogate window never renders the application, whatever else is true — checked ahead of
  // every other return for exactly that reason.
  //
  // `choose` is the one exception, and it is not one: the login chooser is not the application.
  // This window exists to sign someone in, and when nothing arrived to return from and nobody is
  // signed in, asking which provider is the only thing left that can move the flow forward. The
  // surrogate URL is supposed to carry `?method=` so the question is already answered, but a
  // caller that opens the window from a bare "Log in" — the framed application's own header, for
  // one — has no method to send. Rendering the "working" panel over that state left a popup
  // sitting on "Signing you in…" indefinitely, because nothing was ever going to start it.
  if (env.surrogate && !choose) {
    return <LoginSurrogateView
      intent={LoginIntent.Login}
      stage={
        error != null ? SurrogateStage.Failed
          : outcome === LoginOutcome.Orphaned ? SurrogateStage.Orphaned
            : outcome === LoginOutcome.Gesture ? SurrogateStage.Gesture
              : outcome === LoginOutcome.Failed ? SurrogateStage.Failed
                : SurrogateStage.Working
      }
      onAction={outcome === LoginOutcome.Gesture ? onLogin : () => window.close()}
      error={errorDescription ?? error ?? undefined}
      translate={(key, defaultValue) => tAuth(key, { defaultValue })}
    />
  }

  if (error != null) {
    return <div>{t('error', { error: errorDescription ?? error })}</div>
  }

  if (outcome === LoginOutcome.Orphaned) {
    return <div>{tAuth('login.orphaned', {
      defaultValue: 'Signed in. You can close this window and continue in the application.'
    })}</div>
  }

  // `Gesture` outside a surrogate means a framed document that has to open a window, and only a
  // click may. The chooser IS that control — every method button is a gesture — so it is what gets
  // rendered rather than a bare "Sign in" that says nothing about where it goes.
  if (choose || outcome === LoginOutcome.Gesture) {
    const Screen = context.login().screen() ?? FallbackLoginScreen

    return <Screen translate={(key, defaultValue) => tAuth(key, { defaultValue })} />
  }

  return query.has(AUTH_QUERY)
    ? <div>{t('loading')}</div>
    : undefined
})
