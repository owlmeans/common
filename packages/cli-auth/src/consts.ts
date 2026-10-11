/** Overrides where the credentials file lives. Unset means `~/.owlmeans`. */
export const ENV_CREDENTIALS_FILE = 'OWLMEANS_CREDENTIALS'

export const DEFAULT_CREDENTIALS_FILENAME = '.owlmeans'

/** How long `require()` waits for a sign-in this call itself started before returning
 * `SignInRequired` and letting the sign-in continue in the background. */
export const DEFAULT_WAIT_MS = 20_000

/** RFC 8628's own ceiling is whatever the server answered with; this is the poller's OWN patience
 * before it gives up entirely, independent of `expires_in`. */
export const MAX_SIGN_IN_WAIT_MS = 15 * 60 * 1000
