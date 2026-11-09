import type { AuthenticationPlugin } from '@owlmeans/client-auth/manager/plugins'
import { AuthenticationStage, CAUTHEN_AUTHEN_TYPED, DISPATCHER } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'
import { DEFAULT_ALIAS as AUTH_SERVICE } from '@owlmeans/client-auth'
import type { AuthService } from '@owlmeans/auth-common'
import { GOOGLE_CLIENT_AUTH } from '@owlmeans/oidc'
import { useContext, useValue } from '@owlmeans/client'
import { LoginFailureView, loginFailureHelper, loginLandingOf, makeAuthTranslate } from '@owlmeans/client-auth/login'
import type { Module } from '@owlmeans/web-client'
import { logger } from '@owlmeans/log'
import { Progress } from '../../@/components/ui/progress.js'
import { googleClientHelper } from './helpers.js'

const log = logger('web-oidc-rp:google')

export const googleClientPlugin: AuthenticationPlugin = {
  type: GOOGLE_CLIENT_AUTH,

  // `i18nKey` rather than the default (the plugin's own type): the type is `google-oauth`, the
  // translated key is `google`, and without this the button printed the machine id at the user.
  method: { order: 10, icon: 'google', i18nKey: 'google', emphasis: 'primary' },

  Implementation: Renderer => ({ type, stage, control }) => {
    const context = useContext()
    Renderer = Renderer ?? googleClientPlugin.Renderer

    useValue(async cancel => {
      // Every step below can reject — the allowance, the callback exchange, the bearer exchange. A
      // rejection ends in the Error stage, never in a progress bar nobody will ever move: the loader
      // runs unawaited, so without this it was an unhandled rejection under an endless spinner.
      // `cancel` is NOT consulted on the way out: the exchange itself moves the stage, which cancels
      // this very run while it is still waiting for the answer it must report.
      try {
        switch (control.stage) {
          case AuthenticationStage.Init: {
            const hasState = await control.hasPersistentState()
            if (cancel?.current) return

            // Returning from Google redirect — restore state and authenticate
            if (hasState) {
              await control.restore()
              await control.cleanUpState()

              const url = new URL(window.location.href)
              const code = url.searchParams.get('code')

              if (code != null) {
                const auth: AuthCredentials = googleClientHelper.buildCallbackCredentials(
                  url.searchParams.toString(),
                  type,
                  control.allowance?.challenge ?? '',
                )

                const token = await control.authenticate(auth)

                if (token.token !== '') {
                  const authService = context.service<AuthService>(AUTH_SERVICE)
                  await authService.authenticate(token)
                }

                // A registered step (marketing consent, say) or a device/authorization-code
                // consent screen that suspended itself here before sending the browser to sign in
                // both take priority over the app's own home — `landAfterLogin` is the whole
                // decision.
                const landings = loginLandingOf(context)
                const landing = await landings.landAfterLogin()
                window.location.href = await landings.landingUrl(landing)

                return
              }
            }

            // Initial request — ask server for Google auth URL
            const source = await context.entrypoint<Module<string>>(CAUTHEN_AUTHEN_TYPED).url({
              params: { type }
            }, { absolute: true })
            await control.requestAllowence({ type, source })
            break
          }

          case AuthenticationStage.Authenticate: {
            if (cancel?.current) return

            if (control.allowance?.challenge != null) {
              // The server wraps challenge as "source:googleUrl" — extract the URL part
              const source = await context.entrypoint<Module<string>>(CAUTHEN_AUTHEN_TYPED).url({
                params: { type }
              }, { absolute: true })
              const url = googleClientHelper.extractGoogleUrl(control.allowance.challenge, source)

              // Persist control state before redirect
              await control.persist()

              // Redirect to Google
              document.location.href = url
            }
            break
          }
        }
      } catch (error) {
        const failure = loginFailureHelper.failureOf(error)
        if (failure.refused) {
          log.warn('Google sign-in refused', { kind: failure.kind, incidentId: failure.incidentId }, { event: 'auth.refused' })
        } else {
          log.error('Google sign-in failed', error, { event: 'auth.refused' })
        }
        await control.setError(error)
      }
    }, [type, stage])

    if (stage === AuthenticationStage.Error) {
      const failure = loginFailureHelper.failureOf(control.error)
      // A refusal goes back to the choice of how to sign in — this account will not do here. Any
      // other failure starts Google again: the persisted state is gone, so Init asks for a new
      // authorization URL instead of replaying the spent code.
      const onAction = failure.refused
        ? () => {
          void loginLandingOf(context).landingUrl({ alias: DISPATCHER }).then(url => { window.location.href = url })
        }
        : () => control.updateStage(AuthenticationStage.Init)

      // `makeAuthTranslate`, not `useI18nLib`: this route is reached straight from Google, and an
      // app rendered without an i18n provider must still get its sentence rather than a throw.
      return <LoginFailureView failure={failure} page onAction={onAction} translate={makeAuthTranslate(context.cfg)} />
    }

    if (Renderer == null) {
      throw new SyntaxError('Renderer is not defined for Google plugin')
    }

    return <Renderer type={type} stage={stage} control={control} params={{}} />
  },

  Renderer: () => <Progress />
}
