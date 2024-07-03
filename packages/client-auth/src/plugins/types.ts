import type { FC } from 'react'
import type { AuthenticationRenderer, AuthenticationRendererProps } from '../components/authentication/types.js'

export interface AuthenticationPlugin {
  type: string
  Implementation: PluginImplemnetation
  Renderer?: AuthenticationRenderer
}

export interface PluginImplemnetation {
  (Renderer?: AuthenticationRenderer): FC<AuthenticationRendererProps>
}
