import type { OidcSharedConfig } from '@owlmeans/oidc'

export interface OidcCookieHelper {
  setInteractionUid: (uid: string) => void 
}

export interface WithSharedConfig {
  oidc: OidcSharedConfig
}
