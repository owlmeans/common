import type { AuthenticationControl } from './types.js'
import {
  ALL_SCOPES, AUTHEN_AUTHEN, AUTHEN_INIT, AuthRole, AuthenticationStage, AuthenticationType,
} from '@owlmeans/auth'
import type { AllowanceResponse, AllowanceRequest, AuthToken } from '@owlmeans/auth'
import type { ClientContext } from '@owlmeans/client'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientModule } from '@owlmeans/client-module'
import { AuthenCredError } from '../../errors.js'
import { plugins } from '../../plugins/index.js'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { EnvelopeModel } from '@owlmeans/basic-envelope'

export const makeControl = (
  context: ClientContext<ClientConfig>,
  callback?: (token: AuthToken) => Promise<boolean>
): AuthenticationControl => {

  // @TODO: This control should deal with scopes someway
  const control: AuthenticationControl = {
    
    stage: AuthenticationStage.Init,

    type: AuthenticationType.BasicEd25519,

    requestAllowence: async request => {
      control.setStage?.(control.stage = AuthenticationStage.Allowence)

      control.request = (request ?? { type: control.type }) as AllowanceRequest
      control.type = control.request.type as string

      const module = context.module<ClientModule<AllowanceResponse>>(AUTHEN_INIT)
      const [allowance] = await module.call({ body: control.request })

      control.allowance = allowance

      control.setStage?.(control.stage = AuthenticationStage.Authenticate)
    },

    authenticate: async credentials => {
      control.setStage?.(control.stage = AuthenticationStage.Authentication)
      try {
        credentials.type = control.type
        if (control.allowance?.challenge == null) {
          throw new AuthenCredError('allowance')
        }
        const envelope: EnvelopeModel = makeEnvelopeModel(control.allowance?.challenge, EnvelopeKind.Wrap)

        credentials.challenge = envelope.message()
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

        // We sign unwrapped challenge
        await plugins[control.type].authenticate(credentials, context)
        // We return back unwrapped challenge
        credentials.challenge = control.allowance?.challenge

        const [token] = await context.module<ClientModule<AuthToken>>(AUTHEN_AUTHEN)
          .call({ body: credentials })

        if (callback != null) {
          if (await callback(token)) {
            return { token: '' }
          }
        }

        return token
      } catch (error) {
        control.setStage?.(control.stage = AuthenticationStage.Authenticate)
        throw error
      }
    }
  }

  return control
}
