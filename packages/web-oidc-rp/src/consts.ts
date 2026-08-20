
export const DEFAULT_ALIAS = 'oidc-rp'

/**
 * `window.name` of the login popup — how the dispatcher loaded inside it recognises that it is the
 * popup rather than the page that opened it, without depending on `window.opener` alone (an opener
 * exists for plenty of windows this flow did not create).
 */
export const OIDC_POPUP_NAME = 'owlmeans-oidc-login'

/** `postMessage` type carrying the issued bearer token from the login popup back to its opener. */
export const OIDC_POPUP_TOKEN = 'owlmeans:oidc:popup-token'

/** Popup geometry — big enough for a provider's own login and consent screens. */
export const OIDC_POPUP_FEATURES = 'popup=yes,width=520,height=760'

/**
 * `sessionStorage` key marking this window as the login popup.
 *
 * `window.name` cannot carry that fact on its own: browsers clear it whenever a top-level context
 * navigates cross-origin, and this flow leaves for the provider and comes back. sessionStorage is
 * scoped to this window *and* this origin, so it survives that round trip.
 */
export const OIDC_POPUP_MARKER = '_owlmeans-oidc-popup'

/** How often the opener checks whether the popup was closed without completing (ms). */
export const OIDC_POPUP_WATCH_INTERVAL = 500

export enum OidcAuthPurposes {
  Unknown = 'unknown',
  Subscribe = 'subscribe',
  Login = 'login'
}
