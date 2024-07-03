import { AuthenticationType } from '@owlmeans/auth'
import type { AuthenticationPlugin } from './types.js'

export const ed25519BasicUIPlugin: AuthenticationPlugin = {
  type: AuthenticationType.BasicEd25519,
  Implementation: (Renderer) => ({type, stage, control: manager}) => {
    type = type ?? AuthenticationType.BasicEd25519
    Renderer = Renderer ?? ed25519BasicUIPlugin.Renderer

    if (Renderer == null) {
      throw new SyntaxError('Renderer is not defined for BasicEd25519 plugin')
    }
    return <Renderer type={type} stage={stage} control={manager}/>
  }
}
