import type { FC } from 'react'
import type { AuthenticationControl, AuthenticationRenderer, AuthenticationRendererProps, } from '../components/authentication/types.js'

export interface AuthenticationPlugin extends Pick<
  AuthenticationControl, "beforeAuthenticate" | "afterAuthenticate"
>, Pick<Partial<AuthenticationControl>, "authenticate"> {
  type: string
  Implementation: PluginImplemnetation
  Renderer?: AuthenticationRenderer
}

export interface PluginImplemnetation {
  (Renderer?: AuthenticationRenderer): FC<AuthenticationRendererProps>
}
