/**
 * Keys the target cannot authenticate without.
 *
 * Reported exactly like the publisher's `ConfigureAck.missing`: a key with an EMPTY value counts
 * as MISSING, because a push that ran before a secret existed leaves one behind, and a target
 * holding `OIDC_CLIENT=''` is a target whose users can never sign in — with nothing anywhere
 * saying so.
 */
export const REQUIRED_ENV_KEYS = ['OIDC_ISSUER_URL', 'OIDC_CLIENT', 'OIDC_SECRET']

/**
 * The api's and the worker's environment — the process side of the target.
 *
 * Everything a server may hold lives here and nowhere else: the database URL, the queue URL, the
 * OIDC secret.
 */
export const ROOT_ENV_FILE = '.env'
