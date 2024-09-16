
import type { AuthenticationPlugin } from '@owlmeans/client-auth/manager/plugins'
import { AuthenticationStage } from '@owlmeans/auth'
import { OIDC_CLIENT_AUTH } from '@owlmeans/oidc'
import { useEffect } from 'react'
import LinearProgress from '@mui/material/LinearProgress'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { Config, Context, OidcAuthService } from '../types.js'
import { useContext } from '@owlmeans/web-client'
import { DEFAULT_ALIAS } from '../consts.js'

export const oidcClientPlugin: AuthenticationPlugin = {
  type: OIDC_CLIENT_AUTH,

  Implementation: Renderer => ({ type, stage, control }) => {
    const context = useContext<Config, Context>()
    Renderer = Renderer ?? oidcClientPlugin.Renderer

    useEffect(() => {
      if (control.stage === AuthenticationStage.Init) {
        const oidc = context.service<OidcAuthService>(DEFAULT_ALIAS)

        oidc.proceedToRedirectUrl().then(source => {
          // @TODO fix remounting consuequences some other way
          if (source === '') {
            return
          }
          console.log('Redirect url to source: ', source)
          void control.requestAllowence({ type, source })
        })
      }
    }, [type])

    if (Renderer == null) {
      throw new SyntaxError('Renderer is not defined for OIDC plugin')
    }

    return <Renderer type={type} stage={stage} control={control} />
  },

  Renderer: ({ stage, control }) => {
    useEffect(() => {
      console.log(stage, control.allowance)
      switch (stage) {
        case AuthenticationStage.Authenticate:
          if (control.allowance?.challenge != null) {
            const envelope = makeEnvelopeModel(control.allowance?.challenge, EnvelopeKind.Wrap)
            const challenge = envelope.message<string>(true)

            const parts = challenge.split(':http')
            const url = 'http' + parts[1]
            console.log('Url to redirect', url)
            document.location.href = url
          }
      }
    }, [stage])

    return <LinearProgress />
  },

  authenticate: async () => ({ token: '' })
}
