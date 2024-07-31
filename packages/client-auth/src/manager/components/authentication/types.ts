import type { 
  AllowanceRequest, AllowanceResponse, AuthCredentials, AuthenticationStage, AuthenticationType, 
  AuthToken
} from '@owlmeans/auth'
import type { ModuleContextParams } from '@owlmeans/client'
import type { FC } from 'react'

export type ClientAuthType = AuthenticationType | string

export interface AuthenticationProps extends ModuleContextParams {
  type?: ClientAuthType
  callback?: (token: AuthToken) => Promise<boolean>
  source?: string
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
  source?: string
  setStage?: (stage: AuthenticationStage) => void
  requestAllowence: (request?: Partial<AllowanceRequest>) => Promise<void>
  authenticate: (credential: Partial<AuthCredentials> & Pick<AuthCredentials, "userId" | "credential">) => Promise<AuthToken>
}
