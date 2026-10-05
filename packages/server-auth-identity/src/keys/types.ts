import type { ProviderProfileDetails } from '@owlmeans/oidc'
import type { IdentityCredentials } from '../types.js'

/** The keys the identity store names a person, an app row and a sign-in method by. */
export interface IdentityKeyHelper {
  /**
   * The profile id of an (account, app) — computed, never minted, the same on every row of the pair.
   *
   * Computed so that two first sign-ins racing each other write the SAME key and the unique
   * `{profileId, entityId}` index settles them, and so that a caller holding the account and the app
   * needs no read to name the person. Hashed so the account's record id never reaches the wire, and
   * keyed by the app so two apps never see one subject. Nothing parses it.
   */
  profileIdOf: (service: string, accountId: string) => string
  /**
   * The unique key of a sign-in method's credential row: the login's type, its external key
   * `"{type}:{service}:{providerSub}"` and its login-service key `"service:{type}:{service}"`.
   */
  credentialKeyOf: (details: ProviderProfileDetails) => Pick<IdentityCredentials, 'type' | 'userId' | 'credential'>
  /** The form every account address is stored and looked up in. */
  normalizeEmail: (email: string) => string
}
