import { useWs } from '@owlmeans/client-socket'
import { AUTH_SCOPE, AUTHEN_RELY, AuthenticationStage, AuthenticationType, AuthRole } from '@owlmeans/auth'
import type { AllowanceRequest, AllowanceResponse, Auth, AuthCredentials } from '@owlmeans/auth'
import type { AuthenticationPlugin } from './types.js'
import type { PinForm, TunnelAuthenticationRenderer } from './tunnel/types.js'
import { useCallback, useEffect } from 'react'
import type { Connection } from '@owlmeans/socket'
import { isEventMessage, SocketTimeout } from '@owlmeans/socket'
import type { AuthenticationControl } from '../components/authentication/types.js'
import { RELY_ACTION_TIMEOUT, RELY_PIN_PERFIX } from '@owlmeans/auth-common'
import { createWalletFacade } from './tunnel/wallet.js'

export const tunnelConsumerUIPlugin: AuthenticationPlugin = {
  type: AuthenticationType.WalletConsumer,

  Implementation: renderer => ({ type, stage, control, params }) => {
    type = type ?? AuthenticationType.WalletConsumer
    const Renderer: TunnelAuthenticationRenderer | undefined = renderer
      ?? tunnelConsumerUIPlugin.Renderer

    const connection = useWs(AUTHEN_RELY)

    if (Renderer == null) {
      throw new SyntaxError('Renderer is not defined for WalletConsumer plugin')
    }

    useEffect(() => {
      if (connection != null) {
        control.updateStage(AuthenticationStage.Allowence)
        connection.auth<AllowanceRequest, AllowanceResponse>(
          AuthenticationStage.Init, { type: AuthenticationType.RelyHandshake }
        ).then(async (allowance: AllowanceResponse) => {
          control.allowance = allowance
          control.updateStage(AuthenticationStage.Authenticate)

          connection.defaultCallTimeout = RELY_ACTION_TIMEOUT * 1000
        })

        connection.authenticate = async (stage: AuthenticationStage, payload: any) => {
          if (stage === AuthenticationStage.Authenticated) {
            try {
              if (control.callback == null) {
                throw new SyntaxError('Tunnel consumer requires a callback to provide connection object')
              }
              await control.callback(payload, createWalletFacade(connection))
              control.updateStage(AuthenticationStage.Authentication)
            } catch (e) {
              await connection.close()
              await control.setError(e)
            }
          }
          return [null, null as any]
        }

        return connection.listen(async message => {
          if (isEventMessage(message) && message.event === 'close') {
            await control.setError(new SocketTimeout('rely'))
          }
        })
      }
    }, [connection])

    const submit = useCallback(
      connection != null ? makeSubmit(connection, control) : async () => void 0
      , [connection != null]
    )

    return <Renderer type={type} stage={stage} control={control} conn={connection} params={params} submit={submit} />
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
    // (auth)
  } catch (e) {
    await conn.close()
    await control.setError(e)
  }
}
