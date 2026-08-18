
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

/** How often the opener checks whether the popup was closed without completing (ms). */
export const OIDC_POPUP_WATCH_INTERVAL = 500

export enum OidcAuthPurposes {
  Unknown = 'unknown',
  Subscribe = 'subscribe',
  Login = 'login'
}
