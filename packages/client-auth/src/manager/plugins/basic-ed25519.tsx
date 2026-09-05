import { AuthenticationStage, AuthenticationType } from '@owlmeans/auth'
import type { AuthenticationPlugin } from './types.js'
import { useEffect } from 'react'
import { makeKeyPairModel } from '@owlmeans/basic-keys'
import { AuthenCredError } from '../errors.js'

export const ed25519BasicUIPlugin: AuthenticationPlugin = {
  type: AuthenticationType.BasicEd25519,

  method: { order: 300, icon: 'key', emphasis: 'secondary' },

  // This package ships no UI family, so the form below is a `Renderer` a panel package assigns
  // (`@owlmeans/web-panel/auth/plugins`, `@owlmeans/mui-panel/auth/plugins`). Until one does, the
  // Implementation throws on mount — so the sign-in screen must not offer the method.
  requiresRenderer: true,

  Implementation: Renderer => ({ type, stage, control, params }) => {

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

    return <Renderer type={type} stage={stage} control={control} params={params} />
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
