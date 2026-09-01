
import { DispatcherHOC } from '@owlmeans/client-auth'
import { useCallback, useEffect, useState } from 'react'
import { useContext } from '@owlmeans/web-client'
import { useI18nLib } from '@owlmeans/client-i18n'
import { AUTH_QUERY } from '@owlmeans/auth'
import { OIDC_ERROR_DESCRIPTION_QUERY, OIDC_ERROR_QUERY } from '@owlmeans/oidc'
import { useFlow } from '@owlmeans/web-flow'
import { OidcAuthService } from '../types.js'
import { DEFAULT_ALIAS } from '../consts.js'
import {
  LoginIntent, LoginOutcome, ResumeAction, resumeAction,
} from '@owlmeans/client-auth/login'
import { LoginSurrogateView, SurrogateStage } from '@owlmeans/web-client'

export const Dispatcher = DispatcherHOC(({ provideToken, navigate }) => {
  const context = useContext()
  const [query] = context.router().useSearchParams()
  const client = useFlow()

  const t = useI18nLib('auth', 'dispatcher')
  const tAuth = useI18nLib('auth')

  // Read in the component body, not in the effect: `window.name` is set before this document
  // loads and `sessionStorage` carries the marker across the provider round trip, so the answer
  // is already right at first paint — and a popup that flashes the application before an effect
  // corrects it is the defect this exists to prevent.
  const [env] = useState(() => context.login().env())

  // The provider reports a failed authorization by redirecting BACK here with `error` set. Re-entering
  // the flow at that point sends the browser into the very authorization request that just failed —
  // an endless dispatcher <-> provider redirect loop that also hides the reason. Surface it, stop.
  const error = query.get(OIDC_ERROR_QUERY)
  const errorDescription = query.get(OIDC_ERROR_DESCRIPTION_QUERY)

  // What the login service said about this document, when it said anything the user must see.
  const [outcome, setOutcome] = useState<LoginOutcome | null>(null)

  const onLogin = useCallback(() => {
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
        const redirect = await oidc.authenticate(client.flow(), params)
        if (redirect != null && redirect !== '') {
          const authorized = await context.login().authorize(redirect)
          if (authorized === LoginOutcome.Gesture) {
            setOutcome(LoginOutcome.Gesture)
          }
          return
        }
        const authzToken = await context.auth().authenticated()
        if (authzToken == null || authzToken === '') {
          provideToken({ token: '' }, undefined)

          return
        }
        // A session already exists in THIS document. Whether it is useful here, or belongs to the
        // window that opened this one, is the plugin's call — the dispatcher reads no environment.
        const settled = await context.login().resume(authzToken)
        switch (resumeAction(settled)) {
          case ResumeAction.Stop:
            return
          case ResumeAction.Render:
            setOutcome(settled)

            return
          default:
            await navigate()
        }
      })
    }
  }, [client, error])

  // A surrogate window never renders the application, whatever else is true — checked ahead of
  // every other return for exactly that reason.
  //
  // Unlike `web-oidc-rp`, this dispatcher never defers to a method chooser — it starts the
  // authorization itself — so there is no state here that the surrogate panel could mask.
  if (env.surrogate) {
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
    return <div>{t('popup-orphaned', {
      defaultValue: 'Signed in. You can close this window and continue in the application.'
    })}</div>
  }

  if (outcome === LoginOutcome.Gesture) {
    return <button type="button" onClick={onLogin}>
      {t('popup-login', { defaultValue: 'Sign in' })}
    </button>
  }

  return query.has(AUTH_QUERY)
    ? <div>{t('loading')}</div>
    : undefined
})
