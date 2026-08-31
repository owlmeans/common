/** The ordinary flow: leave for the provider and come back. */
export const REDIRECT_LOGIN = 'owlmeans-redirect-login'

/** The flow that runs one window up, for a document that cannot redirect where it is. */
export const SURROGATE_LOGIN = 'owlmeans-surrogate-login'

/**
 * Registered above the default so it wins the cascade wherever it applies. It applies narrowly —
 * only in a frame, or in the surrogate window itself — so the default still serves every
 * ordinary tab.
 */
export const SURROGATE_LOGIN_PRIORITY = 100
