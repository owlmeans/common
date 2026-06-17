import type { InitializedService } from '@owlmeans/context'
import type { AppConfig, AppContext } from '@owlmeans/web-client'
import type { OIDCAuthInitParams, WithSharedConfig } from '@owlmeans/oidc'
import type { OidcAuthPurposes } from './consts.js'
import type { FlowModel, FlowPayload } from '@owlmeans/flow'
import type { ResourceRecord } from '@owlmeans/resource'
import type { AuthToken } from '@owlmeans/auth'

export interface OidcAuthService extends InitializedService {
  dispatch: (params: Record<string, string>) => Promise<boolean>

  authenticate: (flow: FlowModel, params: OIDCAuthInitParams) => Promise<string | null>

  // This is dedicated authentication service implementation
  proceedToRedirectUrl: (extras: OidcAuthRedirectExtras) => Promise<string>

  // @TODO Unfinished implementation
  dispatchClientOnly: () => Promise<void>
}

export interface OidcAuthRedirectExtras extends FlowPayload {
  purpose: OidcAuthPurposes
  simplified?: string
  uid?: string
  alias?: string
}

export interface OidcPostAuthPayload extends FlowPayload , AuthToken {
  purpose: OidcAuthPurposes
  simplified?: string
}

export interface Config extends AppConfig, WithSharedConfig { }

export interface Context<C extends Config = Config> extends AppContext<C> { }

export interface OidcInteraction extends ResourceRecord {
  authUrl: string 
}
