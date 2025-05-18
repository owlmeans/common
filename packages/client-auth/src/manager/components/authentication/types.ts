import type {
  AllowanceRequest, AllowanceResponse, AuthCredentials, AuthenticationStage, AuthenticationType,
  AuthToken
} from '@owlmeans/auth'
import type { ModuleContextParams } from '@owlmeans/client'
import type { FC } from 'react'
import type { ClientContext } from '@owlmeans/client'
import type { FlowService } from '@owlmeans/client-flow'
import type { ResilientError } from '@owlmeans/error'

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
  params: Record<string, unknown>
}

export interface AuthenticationRenderer extends FC<AuthenticationRendererProps> {
}

export interface AuthenticationControlState {
  stage: AuthenticationStage
  type: ClientAuthType
  request?: AllowanceRequest
  allowance?: AllowanceResponse
  error?: ResilientError
  source?: string
}

export interface AuthenticationControl extends AuthenticationControlState {
  callback?: AuthenticationCallback
  setStage?: (stage: AuthenticationStage) => void
  updateStage: (stage: AuthenticationStage) => void
  requestAllowence: (request?: Partial<AllowanceRequest>) => Promise<void>
  beforeAuthenticate?: (clientToken: AuthToken, context?: ClientContext) => Promise<void>
  afterAuthenticate?: (credential: AuthCredentials, context?: ClientContext) => Promise<void>
  authenticate: ClientAuthenticationMethod

  flow: () => Promise<FlowService | null>

  /**
   * These methods are used to store control state in cases when the screen is left
   * during authentication process. E.g. for OIDC authentication on web
   */
  persist: () => Promise<boolean>
  restore: () => Promise<boolean>
  hasPersistentState: () => Promise<boolean>
  cleanUpState: () => Promise<void>

  setError: (error: unknown) => Promise<void>
}

export interface ClientAuthenticationMethod {
  (
    credential: Partial<AuthCredentials> & Pick<AuthCredentials, "userId" | "credential">,
    context?: ClientContext
  ): Promise<AuthToken>
}

export interface AuthenticationCallback {
  (token: AuthToken, ...args: any[]): Promise<boolean>
}
