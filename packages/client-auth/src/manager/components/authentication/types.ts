import type { AllowanceRequest, AllowanceResponse, AuthCredentials, AuthenticationStage, AuthenticationType } from '@owlmeans/auth'
import type { FC } from 'react'

export type ClientAuthType = AuthenticationType | string

export interface AuthenticationProps {
  type?: ClientAuthType
}

export interface TAuthenticationHOC {
  (Renderer?: AuthenticationRenderer): FC<AuthenticationProps>
}

export interface AuthenticationRendererProps {
  stage: AuthenticationStage
  type: ClientAuthType
  control: AuthenticationControl
}

export interface AuthenticationRenderer extends FC<AuthenticationRendererProps> {
}

export interface AuthenticationControlState {
  stage: AuthenticationStage
  type: ClientAuthType
  request?: AllowanceRequest
  allowance?: AllowanceResponse
}

export interface AuthenticationControl extends AuthenticationControlState {
  requestAllowence: (request?: Partial<AllowanceRequest>) => Promise<void>
  authenticate: (credential: Partial<AuthCredentials> & Pick<AuthCredentials, "userId" | "credential">) => Promise<void>
}
