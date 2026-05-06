
import type { AuthenticationPlugin } from '@owlmeans/client-auth/manager/plugins'
import { AUTH_SCOPE, AuthenticationStage, AuthRole } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'
import { GOOGLE_CLIENT_AUTH } from '@owlmeans/oidc'
import { useValue } from '@owlmeans/client'
import LinearProgress from '@mui/material/LinearProgress'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'

export const googleClientPlugin: AuthenticationPlugin = {
  type: GOOGLE_CLIENT_AUTH,

  Implementation: Renderer => ({ type, stage, control }) => {
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
              const auth: AuthCredentials = {
                ...control.allowance,
                type,
                challenge: control.allowance?.challenge ?? '',
                credential: url.searchParams.toString(),
                role: AuthRole.User,
                userId: 'code',
                scopes: [AUTH_SCOPE],
              }

              await control.authenticate(auth)
              return
            }
          }

          // Initial request — ask server for Google auth URL
          const source = window.location.origin + window.location.pathname
          await control.requestAllowence({ type, source })
          break
        }

        case AuthenticationStage.Authenticate: {
          if (cancel?.current) return

          if (control.allowance?.challenge != null) {
            const envelope = makeEnvelopeModel(control.allowance.challenge, EnvelopeKind.Wrap)
            const url = envelope.message<string>(true)

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

  Renderer: () => <LinearProgress />
}
