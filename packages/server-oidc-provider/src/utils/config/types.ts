import type { OidcCustomConfiguration } from '../../types.js'

/** The provider configuration one context's settings resolve to. */
export interface OidcConfigUtils {
  /**
   * The deployment's configuration merged over this package's defaults: its clients with their
   * `{{service-alias}}` URIs expanded (and, in debug only, a generated secret), the claims behind
   * every scope, the discovery extras and the signing key.
   */
  combineConfig: (unsecure: boolean) => Promise<OidcCustomConfiguration>
}
