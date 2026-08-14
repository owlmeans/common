import { OIDC_RP_BASE_SCOPES } from '@owlmeans/oidc'

/**
 * The `scope` an authorization request carries: the base scopes every OwlMeans relying party needs
 * plus the provider-specific extras from `OidcProviderDescriptor.extraScopes`.
 *
 * Deduplicated and trimmed — `extraScopes` is operator-supplied config, and a repeated or empty
 * entry would otherwise reach the provider verbatim. Every consumer of this list must be
 * registered with a provider whose client allows all of it: `oidc-provider` answers `invalid_scope`
 * on a supported-but-not-allowed scope instead of dropping it.
 */
export const requestedScope = (extraScopes?: string | null): string => [...new Set([
  ...OIDC_RP_BASE_SCOPES,
  ...(extraScopes ?? '').split(' ').map(scope => scope.trim()).filter(scope => scope !== ''),
])].join(' ')
