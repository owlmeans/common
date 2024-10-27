import { useWs } from '@owlmeans/client-socket'
import { AUTH_SCOPE, AUTHEN_RELY, AuthenticationStage, AuthenticationType, AuthRole } from '@owlmeans/auth'
import type { AllowanceRequest, AllowanceResponse, Auth, AuthCredentials } from '@owlmeans/auth'
import type { AuthenticationPlugin } from './types.js'
import type { PinForm, TunnelAuthenticationRenderer } from './tunnel/types.js'
import { useCallback, useEffect } from 'react'
import type { Connection } from '@owlmeans/socket'
import type { AuthenticationControl } from '../components/authentication/types.js'
import { RELY_PIN_PERFIX } from '@owlmeans/auth-common'
import { createWalletFacade } from './tunnel/wallet.js'

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

    const submit = useCallback(
      connection != null ? makeSubmit(connection, control) : async () => void 0
      , [connection != null]
    )

    return <Renderer type={type} stage={stage} control={control} conn={connection} submit={submit} />
  },

  authenticate: async _credentials => {

    // We don't use it - just type compatibility
    return { token: '' }
  }
}

const makeSubmit = (conn: Connection, control: AuthenticationControl) => async (data: PinForm) => {
  await control.updateStage(AuthenticationStage.Authentication)
  try {
    const auth = await conn.auth<AuthCredentials, Auth>(AuthenticationStage.Authenticate, {
      challenge: control.allowance?.challenge ?? '',
      credential: RELY_PIN_PERFIX + data.pin,
      type: control.type,
      role: AuthRole.Guest,
      userId: '',
      scopes: [AUTH_SCOPE]
    })

    if (conn.stage === AuthenticationStage.Authenticated) {
      if (control.callback == null) {
        throw new SyntaxError('Tunnel consumer requires a callback to provide connection object')
      }
      await control.callback(auth, createWalletFacade(conn))
    }

    console.log(auth)
  } catch (e) {
    await conn.close()
    await control.setError(e)
  }
}
