export const DEFAULT_ALIAS = 'login-service'

export const LOGIN_SERVICE = DEFAULT_ALIAS

/** Priority of a plugin that makes no claim about the environment. */
export const DEFAULT_LOGIN_PRIORITY = 0

/**
 * Name given to the surrogate login window, and the marker it records about itself.
 *
 * These values are a wire protocol between two documents that may be running different builds —
 * an opener holding an older bundle and a surrogate freshly loaded, or the reverse. They are
 * therefore fixed, and must never be "tidied" to match a newer vocabulary.
 */
export const LOGIN_SURROGATE_NAME = 'owlmeans-oidc-login'

export const LOGIN_TOKEN_MESSAGE = 'owlmeans:oidc:popup-token'

export const LOGIN_SURROGATE_MARKER = '_owlmeans-oidc-popup'

export const LOGIN_SURROGATE_FEATURES = 'popup=yes,width=520,height=760'

/** How often a surrogate window is checked for having been closed by the user. */
export const LOGIN_WATCH_INTERVAL = 500
