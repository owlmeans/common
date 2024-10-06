import type { InitializedService } from '@owlmeans/context'
import type { AppConfig, AppContext } from '@owlmeans/web-client'
import type { WithSharedConfig } from '@owlmeans/oidc'

export interface OidcAuthService extends InitializedService {
  dispatch: () => Promise<void>

  proceedToRedirectUrl: () => Promise<string>
}

export interface Config extends AppConfig, WithSharedConfig {}

export interface Context<C extends Config = Config> extends AppContext<C> {}
