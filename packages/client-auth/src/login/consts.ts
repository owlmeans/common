export const DEFAULT_ALIAS = 'login-service'

export const LOGIN_SERVICE = DEFAULT_ALIAS

/** Priority of a plugin that makes no claim about the environment. */
export const DEFAULT_LOGIN_PRIORITY = 0

/** Order given to a method that declares none. */
export const DEFAULT_METHOD_ORDER = 100

/**
 * Name given to the surrogate login window, the marker it records about itself, and the values the
 * two documents exchange.
 *
 * These are a wire protocol between two documents that may be running different builds — an opener
 * holding an older bundle and a surrogate freshly loaded, or the reverse. They are therefore fixed,
 * and must never be "tidied" to match a newer vocabulary. That applies to the query names and the
 * message types added later just as much as to the original three.
 */
export const LOGIN_SURROGATE_NAME = 'owlmeans-oidc-login'

export const LOGIN_TOKEN_MESSAGE = 'owlmeans:oidc:popup-token'

export const LOGIN_LOGOUT_MESSAGE = 'owlmeans:oidc:popup-logout'

export const LOGIN_SURROGATE_MARKER = '_owlmeans-oidc-popup'

export const LOGIN_SURROGATE_WIDTH = 520

export const LOGIN_SURROGATE_HEIGHT = 760

/**
 * @deprecated Never centered the window — it carried no `left`/`top`, so the surrogate always
 * opened wherever the browser's own default popup placement put it. Superseded by
 * `@owlmeans/web-client`'s `centeredPopupFeatures(LOGIN_SURROGATE_WIDTH, LOGIN_SURROGATE_HEIGHT)`,
 * computed fresh per call since centering depends on where the browser window currently sits.
 * Kept, unchanged, for the same reason as the rest of this block: an already-generated app may
 * carry a copy of code that still imports it.
 */
export const LOGIN_SURROGATE_FEATURES =
  `popup=yes,width=${LOGIN_SURROGATE_WIDTH},height=${LOGIN_SURROGATE_HEIGHT}`

/** How often a surrogate window is checked for having been closed by the user. */
export const LOGIN_WATCH_INTERVAL = 500

/** Carries WHY the surrogate window was opened across the window boundary. */
export const LOGIN_INTENT_QUERY = 'intent'

/**
 * Carries the address the surrogate should run, so the flow parameters the opener's URL held are
 * forwarded rather than discarded.
 */
export const LOGIN_NEXT_QUERY = 'next'

/**
 * Carries the method the user already chose, one window up.
 *
 * A surrogate acting on it is not an auto-redirect in the "never choose for the user" sense: the
 * choice was made, by a person, in the document that opened this one.
 */
export const LOGIN_METHOD_QUERY = 'method'

/** Where a browser records that it agreed to one exact set of legal documents. */
export const LOGIN_TERMS_STORAGE = '_owlmeans-login-terms'
