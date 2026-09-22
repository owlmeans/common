
import type { AuthenticationPlugin } from '@owlmeans/client-auth/manager/plugins'
import { AuthenticationStage, CAUTHEN_AUTHEN_TYPED } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'
import { DEFAULT_ALIAS as AUTH_SERVICE } from '@owlmeans/client-auth'
import type { AuthService } from '@owlmeans/auth-common'
import { GOOGLE_CLIENT_AUTH } from '@owlmeans/oidc'
import { useContext, useValue } from '@owlmeans/client'
import { landAfterLogin, landingUrl } from '@owlmeans/client-auth/login'
import type { Module } from '@owlmeans/web-client'
import { Progress } from '../../@/components/ui/progress.js'
import { extractGoogleUrl, buildCallbackCredentials } from './helpers.js'

export const googleClientPlugin: AuthenticationPlugin = {
  type: GOOGLE_CLIENT_AUTH,

  // `i18nKey` rather than the default (the plugin's own type): the type is `google-oauth`, the
  // translated key is `google`, and without this the button printed the machine id at the user.
  method: { order: 10, icon: 'google', i18nKey: 'google', emphasis: 'primary' },

  Implementation: Renderer => ({ type, stage, control }) => {
    const context = useContext()
    Renderer = Renderer ?? googleClientPlugin.Renderer

    useValue(async cancel => {
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
              const auth: AuthCredentials = buildCallbackCredentials(
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
              const landing = await landAfterLogin(context)
              window.location.href = await landingUrl(context, landing)

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
            const url = extractGoogleUrl(control.allowance.challenge, source)

            // Persist control state before redirect
            await control.persist()

            // Redirect to Google
            document.location.href = url
          }
          break
        }
      }
    }, [type, stage])

    if (Renderer == null) {
      throw new SyntaxError('Renderer is not defined for Google plugin')
    }

    return <Renderer type={type} stage={stage} control={control} params={{}} />
  },

  Renderer: () => <Progress />
}
