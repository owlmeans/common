import type { Auth, AuthCredentials, AuthToken, Authorization } from '../types.js'

/** Checks of the authentication payloads that cross the wire. */
export interface AuthHelper {
  /** Whether a value satisfies the `Auth` schema. */
  verifyAuth: (auth: Auth) => boolean
  /** Whether a value satisfies the `AuthCredentials` schema. */
  verifyAuthCredentials: (auth: AuthCredentials) => boolean
  isAuth: (auth: unknown) => auth is Auth
  isAuthCredentials: (auth: unknown) => auth is AuthCredentials
  isAuthToken: (auth: unknown) => auth is AuthToken
  /**
   * The organization slug carried by an auth payload, tolerating tokens minted before the field
   * was named.
   *
   * Tokens outlive deployments: one signed with the previous release still arrives with the value
   * under `entityId`, and it stays valid until it expires. Everything that reads the organization
   * off a payload goes through here so that window needs no second code path — and so the day the
   * fallback can be deleted is a single-line change rather than an audit.
   */
  entitySlugOf: (payload?: Partial<Authorization> | null) => string | undefined
}
