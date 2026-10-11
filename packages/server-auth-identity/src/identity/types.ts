import type { ProviderProfileDetails } from '@owlmeans/oidc'
import type {
  EnsureAccountArgs, EnsuredAccount, EnsureProfileArgs, IdentityAccount, IdentityCredentials, IdentityProfile,
} from '../types.js'

/** A sign-in method's credential row and the account it signs into, if any. */
export interface LinkedCredential {
  credential: IdentityCredentials
  account: IdentityAccount | null
}

/** The identity store of one context: accounts, their app rows and their sign-in methods. */
export interface IdentityHelper {
  /** The credential row of a sign-in method and the account it signs into, if any. */
  credentialOf: (details: ProviderProfileDetails) => Promise<LinkedCredential | null>
  /**
   * The account of a person — one per e-mail address, whichever method they sign in by.
   *
   * Looked up by the sign-in method's credential first (a returning login), then by the address (a
   * further method of a known person, which is attached as a credential); otherwise registered with a
   * personal organization. Writes no profile row: which app the person is a user of is the caller's
   * to say, through {@link IdentityHelper.ensureProfile}.
   *
   * Every caller must have established the address — a verified provider claim, a proven code, a
   * full-trust key — because whoever names an address here is handed that person's account.
   */
  ensureAccount: (args: EnsureAccountArgs, details?: ProviderProfileDetails) => Promise<EnsuredAccount>
  /**
   * The row of a person in one organization for one app. Idempotent: an existing row is returned as
   * it is, never rewritten.
   *
   * A row outside the account's main organization brings the PRIMARY row of the same (account, app)
   * with it — created first, as the owner of the personal organization — because the primary row is
   * what says whether the person may use the app at all; a crash between the two must never leave a
   * membership without it.
   */
  ensureProfile: (args: EnsureProfileArgs) => Promise<IdentityProfile>
}
