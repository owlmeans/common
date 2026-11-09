/**
 * What a failed sign-in means for the person looking at it.
 *
 * Every kind but {@link LoginFailureKind.Failed} is a refusal of THIS account: trying again with it
 * changes nothing, so a screen offers the way back to the sign-in choice instead of a retry.
 */
export enum LoginFailureKind {
  /** The server refused this account here (403 with the access-denied marker, or `AuthRefused`). */
  Refused = 'refused',
  /** The account is banned — the refusal code `account:disabled` was visible. */
  AccountDisabled = 'account-disabled',
  /** The account's access to this application is blocked — `profile:disabled` was visible. */
  ProfileDisabled = 'profile-disabled',
  /** Anything else: a fault, a timeout, a network error, an expired attempt. Worth a retry. */
  Failed = 'failed',
}
