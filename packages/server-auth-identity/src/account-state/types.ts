import type { IdentityAccount, IdentityProfile, IdentityRefusal } from '../types.js'

/** The row a successful sign-in landed on. */
export interface SignInTouch {
  accountId: string
  profileId: string
  /** The row's organization — for a sign-in through the linking service, the account's main one. */
  entityId: string
}

/**
 * The state of a person's account in one context's identity store: the ban, the last sign-in, and
 * the refusal both imply. Every write is field by field (`$set` / `$unset` through the resource's
 * native collection), never a whole-record replace.
 */
export interface AccountStateHelper {
  /**
   * Ban (`true`) or lift the ban on (`false`) an account — `true` when the account exists.
   *
   * A ban sets `disabled` and `disabledAt` = now; banning a banned account keeps its `disabledAt`.
   * Lifting it sets `disabled: false` and unsets `disabledAt`. Nothing else in the record is written,
   * and sessions are the caller's to revoke.
   */
  setDisabled: (accountId: string, disabled: boolean) => Promise<boolean>
  /** Whether the account is banned. An unknown account is not. */
  isDisabled: (accountId: string) => Promise<boolean>
  /**
   * Stamp a successful sign-in: `signedInAt` = now on the account and on its row (`profileId`,
   * `entityId`). Answers the stamp. Never for a token refresh. A failed write propagates —
   * best-effort is the caller's decision.
   *
   * @throws {SyntaxError} `identity:sign-in-touch` when a key is missing or empty.
   */
  touchSignIn: (touch: SignInTouch) => Promise<Date>
  /**
   * Why `row` may not sign in or keep its session, or `null`: `IDENTITY_ACCOUNT_DISABLED` for a
   * banned account, `IDENTITY_PROFILE_DISABLED` when the PRIMARY row of the row's (account, app) is
   * disabled — the row itself when it is the primary one, else the account's main organization's.
   *
   * `account` saves the read when the caller holds it. An account or a primary row that does not
   * exist refuses nothing here.
   */
  refusalOf: (row: IdentityProfile, account?: IdentityAccount) => Promise<IdentityRefusal | null>
}
