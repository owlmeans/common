import { useWs } from '@owlmeans/client-socket'
import { AUTHEN_RELY, AuthenticationStage, AuthenticationType } from '@owlmeans/auth'
import type { AllowanceRequest, AllowanceResponse } from '@owlmeans/auth'
import type { AuthenticationPlugin } from './types.js'
import type { TunnelAuthenticationRenderer } from './tunnel/types.js'
import { useEffect } from 'react'

export const tunnelConsumerUIPlugin: AuthenticationPlugin = {
  type: AuthenticationType.WalletConsumer,

  Implementation: renderer => ({ type, stage, control }) => {
    type = type ?? AuthenticationType.WalletConsumer
    const Renderer: TunnelAuthenticationRenderer | undefined = renderer
      ?? tunnelConsumerUIPlugin.Renderer

    const connection = useWs(AUTHEN_RELY)

    if (Renderer == null) {
      throw new SyntaxError('Renderer is not defined for WalletConsumer plugin')
    }

    useEffect(() => {
      console.log('Try to get through tunnel', connection ? true : false)
      if (connection != null) {
        control.updateStage(AuthenticationStage.Allowence)
        connection.auth<AllowanceRequest, AllowanceResponse>(
          AuthenticationStage.Init, { type: AuthenticationType.RelyHandshake }
        ).then(async (allowance: AllowanceResponse) => {
          control.allowance = allowance
          // const challenge = makeEnvelopeModel<string>(allowance.challenge, EnvelopeKind.Wrap)
          // const rely = makeEnvelopeModel<RelyToken>(challenge.message(true), EnvelopeKind.Wrap)
          // console.log(rely.message())

          control.updateStage(AuthenticationStage.Authenticate)
        })
      }
    }, [connection])

    return <Renderer type={type} stage={stage} control={control} conn={connection} />
  },

  authenticate: async _credentials => {

    // We don't use it - just type compatibility
    return { token: '' }
  }
}
