
import type { AuthenticationPlugin } from '@owlmeans/client-auth/manager/plugins'
import { AUTH_SCOPE, AuthenticationStage, AuthManagerError, AuthRole } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'
import { OIDC_CLIENT_AUTH } from '@owlmeans/oidc'
import { useEffect } from 'react'
import LinearProgress from '@mui/material/LinearProgress'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { Config, Context, OidcAuthService } from '../../types.js'
import { useContext } from '@owlmeans/web-client'
import { DEFAULT_ALIAS, OidcAuthPurposes } from '../../consts.js'
import { OidcAuthStep, UnknownFlowStep } from '@owlmeans/flow'

export const oidcClientPlugin: AuthenticationPlugin = {
  type: OIDC_CLIENT_AUTH,

  Implementation: Renderer => ({ type, stage, control }) => {
    const context = useContext<Config, Context>()
    Renderer = Renderer ?? oidcClientPlugin.Renderer

    useEffect(() => {
      let canceled = false

      switch (control.stage) {
        case AuthenticationStage.Init:
          control.hasPersistentState().then(async hasState => {
            if (canceled) {
              console.log(':) rendering normalization cancel')
              return
            }
            console.log(canceled, 0)
            // 3. Properly process additional paramters on sequential rendering to restore control state
            if (hasState) {
              console.log(3)
              await control.restore()
              await control.cleanUpState()
              const flow = await control.flow()
              if (flow != null) {
                const state = await flow.state()
                if (state?.step().step === OidcAuthStep.PostAuthen) {
                  const url = new URL(window.location.href)

                  const auth: AuthCredentials = {
                    ...control.allowance,
                    type,
                    challenge: control.allowance?.challenge ?? '',
                    credential: url.searchParams.toString(),
                    role: AuthRole.User,
                    userId: 'code',
                    scopes: [AUTH_SCOPE]
                  }

                  const tokenized = await control.authenticate(auth)
                  // @TODO Introduce some standard further flow in case this plugin/component 
                  // is used without a callback
                  if (tokenized.token !== '') {
                    throw new AuthManagerError('callback')
                  }
                  return // @TODO Will it work here?
                }
              }
              // return
            }

            console.log(1)

            // 1. Initialize OIDC server side authentication
            const oidc = context.service<OidcAuthService>(DEFAULT_ALIAS)

            // @TODO we need to provide an identity provider client as entityId here for flexibel usage
            const source = await oidc.proceedToRedirectUrl({
              purpose: control.source as OidcAuthPurposes ?? OidcAuthPurposes.Unknown
            })
            console.log('request allowence', type, source)
            await control.requestAllowence({ type, source })
          })
        case AuthenticationStage.Authenticate:
          control.flow().then(async flow => {
            if (canceled) {
              console.log('rendering normalization cancel :)')
              return
            }
            console.log(canceled, 2)
            const flowState = await flow?.state()
            if (flowState == null) {
              throw new UnknownFlowStep(AuthenticationStage.Authenticate)
            }

            console.log('Ongoing flow step', flowState.state())
            if (control.allowance?.challenge != null) {
              const envelope = makeEnvelopeModel(control.allowance?.challenge, EnvelopeKind.Wrap)
              const challenge = envelope.message<string>(true)
              const parts = challenge.split(':http')
              const url = 'http' + parts[1]

              // 2. Include additional parameters (control state with allowance to flow state)
              await control.persist()

              console.log('Try to redirect to url for authentication', url)

              document.location.href = url
            }
          })
      }

      return () => { canceled = true }
    }, [type, stage])

    if (Renderer == null) {
      throw new SyntaxError('Renderer is not defined for OIDC plugin')
    }

    return <Renderer type={type} stage={stage} control={control} />
  },

  Renderer: () => <LinearProgress />
}
