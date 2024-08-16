import type {
  AllowanceRequest, AllowanceResponse, AuthCredentials, AuthenticationStage, AuthenticationType,
  AuthToken
} from '@owlmeans/auth'
import type { ModuleContextParams } from '@owlmeans/client'
import type { FC } from 'react'
import type { ClientContext } from '@owlmeans/client'
import type { FlowService } from '@owlmeans/client-flow'

export type ClientAuthType = AuthenticationType | string

export interface AuthenticationProps extends ModuleContextParams {
  type?: ClientAuthType
  callback?: AuthenticationCallback
  source?: string
}

export interface TAuthenticationHOC {
  (Renderer?: AuthenticationRenderer, type?: string): FC<AuthenticationProps>
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
  callback?: AuthenticationCallback
  setStage?: (stage: AuthenticationStage) => void
  updateStage: (stage: AuthenticationStage) => void
  requestAllowence: (request?: Partial<AllowanceRequest>) => Promise<void>
  beforeAuthenticate?: (clientToken: AuthToken, context?: ClientContext) => Promise<void>
  afterAuthenticate?: (credential: AuthCredentials, context?: ClientContext) => Promise<void>
  authenticate: (
    credential: Partial<AuthCredentials> & Pick<AuthCredentials, "userId" | "credential">,
    context?: ClientContext
  ) => Promise<AuthToken>
  flow: () => Promise<FlowService | null>
}

export interface AuthenticationCallback {
  (token: AuthToken, ...args: any[]): Promise<boolean>
}
