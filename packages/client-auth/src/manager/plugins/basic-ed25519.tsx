import { AuthenticationStage, AuthenticationType } from '@owlmeans/auth'
import type { AuthenticationPlugin } from './types.js'
import { useEffect } from 'react'
import { makeKeyPairModel } from '@owlmeans/basic-keys'
import { AuthenCredError } from '../errors.js'

export const ed25519BasicUIPlugin: AuthenticationPlugin = {
  type: AuthenticationType.BasicEd25519,

  Implementation: Renderer => ({ type, stage, control }) => {

    type = type ?? AuthenticationType.BasicEd25519
    Renderer = Renderer ?? ed25519BasicUIPlugin.Renderer

    // BasicEd25519 authentication request allowance unconditionally 
    // (no input or additional challenges required)
    useEffect(() => {
      if (control.stage === AuthenticationStage.Init) {
        void control.requestAllowence()
      }
    }, [type])

    if (Renderer == null) {
      throw new SyntaxError('Renderer is not defined for BasicEd25519 plugin')
    }

    return <Renderer type={type} stage={stage} control={control} />
  },

  authenticate: async credentials => {
    const key = makeKeyPairModel(credentials.credential)

    if (credentials.userId !== key.exportAddress()) {
      throw new AuthenCredError('credentials-missmatch')
    }

    credentials.credential = await key.sign(credentials.challenge)

    // We don't use it - just type compatibility
    return { token: '' }
  }
}
