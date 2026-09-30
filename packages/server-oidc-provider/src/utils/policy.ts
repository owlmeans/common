import { errors, interactionPolicy } from 'oidc-provider'

/** The `reason` of the login check this module adds to the provider's default policy. */
export const ACCOUNT_REFUSED_REASON = 'account_refused'

/**
 * The provider's default interaction policy plus one login check: a session whose account the
 * application REFUSED to load is a session that identifies nobody, so the person logs in again.
 *
 * `findAccount` answering `undefined` is the seam's way of refusing (`OidcAccountService.loadById`),
 * but the provider does not treat it as an absent login. Its own `no_session` check reads the raw
 * `session.accountId`, which is still set, so the login prompt is skipped; `loadGrant` builds a
 * grant only for a loaded account, so the consent prompt then dereferences a grant that was never
 * created and the request ends as a `server_error` — "oops! something went wrong" on the relying
 * party's callback, with a `TypeError` as its only trace. A refusal is routine (a subject that
 * belongs to another organization, a disabled or expired profile), so it has to end in the login
 * prompt, never in a crash.
 *
 * On the way back the provider's own resume step swaps the accounts: a login result naming an
 * account other than the session's runs its logout confirmation first, dropping the stale session,
 * and then continues the original request.
 *
 * A login that has JUST completed (`oidc.result.login`) and still names an account the application
 * refuses is not asked again — that would loop between the login and the refusal for good — it is
 * an `access_denied` the relying party can show.
 */
export const makeInteractionPolicy = (): interactionPolicy.DefaultPolicy => {
  const policy = interactionPolicy.base()

  policy.get('login')?.checks.add(new interactionPolicy.Check(
    ACCOUNT_REFUSED_REASON,
    'End-User account is not accepted, authentication is required',
    'login_required',
    ({ oidc }) => {
      if (oidc.session?.accountId == null || oidc.account != null) {
        return interactionPolicy.Check.NO_NEED_TO_PROMPT
      }

      if (oidc.result?.login != null) {
        throw new errors.AccessDenied(undefined, 'the account that signed in is not accepted')
      }

      return interactionPolicy.Check.REQUEST_PROMPT
    }
  ))

  return policy
}
