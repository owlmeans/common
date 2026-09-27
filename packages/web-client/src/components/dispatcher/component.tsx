import { DispatcherHOC } from '@owlmeans/client-auth'
import { useEffect, useState } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import { AUTH_QUERY } from '@owlmeans/auth'
import {
  FallbackLoginScreen, LoginIntent, LoginOutcome, ResumeAction, resumeAction,
} from '@owlmeans/client-auth/login'
import { LoginSurrogateView, SurrogateStage } from '../../login/view.js'
import { useContext } from '../../context.js'

export const Dispatcher = DispatcherHOC(({ provideToken, navigate }) => {
  const context = useContext()
  const [query] = context.router().useSearchParams()

  const t = useI18nLib('auth', 'dispatcher')
  const tAuth = useI18nLib('auth')

  // Read in the component body, not in the effect: `window.name` is set by `window.open` before
  // this document loads and `sessionStorage` carries the marker across the provider round trip, so
  // the answer is already correct at first paint — and a first paint that showed the application
  // before an effect corrected it is the defect this exists to prevent.
  const [env] = useState(() => context.login().env())
  const [outcome, setOutcome] = useState<LoginOutcome | null>(null)
  // Nothing to return from and nobody signed in: offer the choice rather than starting a flow.
  const [choose, setChoose] = useState(false)

  useEffect(() => {
    // First statement of the effect on purpose: everything below can navigate this window away.
    context.login().enter()

    const token = query.get(AUTH_QUERY)
    if (token != null) {
      const params: Record<string, string> = {}
      query.forEach((value, key) => {
        if (key !== AUTH_QUERY) {
          params[key] = value
        }
      })

      provideToken({ token }, params)

      return
    }

    void context.auth().authenticated().then(async authzToken => {
      if (authzToken == null || authzToken === '') {
        setChoose(true)

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
  }, [])

  // A surrogate window never renders the application, whatever else is true. Checked ahead of
  // every other return for exactly that reason.
  //
  // `choose` is the one state this must NOT mask, and it is not an exception to the rule: the
  // login chooser is not the application. A login window with nothing to return from and nobody
  // signed in has exactly one thing left that can move it forward, and that is asking which
  // provider. The surrogate URL normally carries `?method=` so the question is already settled,
  // but a window opened from a bare "Log in" — the framed application's own header button — has no
  // method to send. Returning the "working" panel there left the popup on "Signing you in…"
  // permanently, because nothing was ever going to start.
  if (env.surrogate && !choose) {
    return <LoginSurrogateView
      intent={LoginIntent.Login}
      stage={
        outcome === LoginOutcome.Orphaned ? SurrogateStage.Orphaned
          : outcome === LoginOutcome.Failed ? SurrogateStage.Failed
            : outcome === LoginOutcome.Gesture ? SurrogateStage.Gesture
              : SurrogateStage.Working
      }
      onAction={() => window.close()}
      translate={(key, defaultValue) => tAuth(key, { defaultValue })}
    />
  }

  if (choose) {
    const Screen = context.login().screen() ?? FallbackLoginScreen

    return <Screen translate={(key, defaultValue) => tAuth(key, { defaultValue })} />
  }

  return query.has(AUTH_QUERY) ? <div style={{
    width: '100%', // Makes the div occupy the full width
    display: 'flex', // Enables flexbox layout
    justifyContent: 'center', // Centers content horizontally
    alignItems: 'center', // Centers content vertically (if needed)
    textAlign: 'center', // Centers text within the div
    paddingTop: '1rem', // Adds some vertical padding
    paddingBottom: '1rem', // Adds some vertical padding
  }}>{t('loading')}</div> : undefined
})
