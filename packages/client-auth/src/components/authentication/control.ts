import type { AuthenticationControl } from './types.js'
import { ALL_SCOPES, AUTHEN_AUTHEN, AUTHEN_INIT, AuthRole, AuthenticationStage, AuthenticationType } from '@owlmeans/auth'
import type { AllowanceResponse, AllowanceRequest, AuthToken, AllowanceEnvelope } from '@owlmeans/auth'
import type { Context } from '@owlmeans/client-context'
import type { Module } from '@owlmeans/client-module'
import { base64, utf8 } from '@scure/base'
import { AuthenCredError } from '../../errors.js'
import { plugins } from '../../plugins/index.js'

export const makeControl = (
  context: Context,
  setStage?: (stage: AuthenticationStage) => void): AuthenticationControl => {

  // @TODO: This control should deal with scopes someway
  const control: AuthenticationControl = {
    stage: AuthenticationStage.Init,

    type: AuthenticationType.BasicEd25519,

    requestAllowence: async request => {
      setStage?.(control.stage = AuthenticationStage.Allowence)

      control.request = (request ?? { type: control.type }) as AllowanceRequest
      control.type = control.request.type as string

      const [allowance] = await context.module<Module<AllowanceResponse>>(AUTHEN_INIT)
        .call(context, { body: control.request })

      control.allowance = allowance

      console.log('>>>>>>>>>>>>>>>', allowance)

      setStage?.(control.stage = AuthenticationStage.Authenticate)
    },

    authenticate: async credentials => {
      setStage?.(control.stage = AuthenticationStage.Authentication)
      try {
        credentials.type = control.type
        if (control.allowance?.challenge == null) {
          throw new AuthenCredError('allowance')
        }
        const envelope: AllowanceEnvelope = JSON.parse(utf8.encode(base64.decode(control.allowance?.challenge)))
        
        credentials.challenge = envelope.msg
        credentials.scopes = credentials.scopes ?? [ALL_SCOPES]
        credentials.role = credentials.role ?? AuthRole.User

        if (credentials.credential == null || credentials.credential === '') {
          throw new AuthenCredError('credential')
        }

        if (credentials.userId == null || credentials.userId === '') {
          throw new AuthenCredError('userId')
        }

        if (credentials.challenge == null || credentials.challenge === '') {
          throw new AuthenCredError('challenge')
        }

        await plugins[control.type].authenticate(credentials)

        const [token] = await context.module<Module<AuthToken>>(AUTHEN_AUTHEN)
          .call(context, { body: credentials })

        console.log(token)

        setStage?.(control.stage = AuthenticationStage.Authenticated)
      } catch (error) {
        setStage?.(control.stage = AuthenticationStage.Authenticate)
        throw error
      }
    }
  }

  return control
}
