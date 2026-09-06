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

export const LOGIN_SURROGATE_FEATURES = 'popup=yes,width=520,height=760'

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

/**
 * Says that this window was opened to PRODUCE a session, not to find one.
 *
 * A surrogate window runs on the application's own origin, so it can see a session the application
 * left there earlier — and a session that is merely present is not a session that still works. The
 * document holding it has no way to tell: `authenticated()` reads storage and decodes an envelope,
 * and nothing in the client asks the server whether the record behind it is still there. So a
 * revoked, replaced or expired token was handed straight back to the window that asked for a
 * login, which adopted it, failed every call it made with it, and asked again — the same dead
 * token, every time, for as long as the browser kept it. Clearing site data was the only exit,
 * which is exactly how the defect was reported.
 *
 * With this set, the surrogate and the dispatcher both skip the resume and run the authorization
 * flow. That is not the expensive path it sounds like: the provider's own session normally answers
 * the request without asking the person anything, and what comes back is a token the provider has
 * just vouched for. It is also what makes signing in as somebody else possible at all.
 */
export const LOGIN_FRESH_QUERY = 'fresh'

/** Where a browser records that it agreed to one exact set of legal documents. */
export const LOGIN_TERMS_STORAGE = '_owlmeans-login-terms'
