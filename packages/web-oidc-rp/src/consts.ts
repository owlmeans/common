
export const DEFAULT_ALIAS = 'oidc-rp'

/**
 * The surrogate-window protocol values.
 *
 * @deprecated Import the `LOGIN_*` names from `@owlmeans/client-auth/login`. These are re-exported
 * under their original names, with their original values, because they are a wire protocol between
 * two documents that may be running different builds — an opener on an older bundle and a freshly
 * loaded surrogate, or the reverse.
 */
export {
  LOGIN_SURROGATE_NAME as OIDC_POPUP_NAME,
  LOGIN_TOKEN_MESSAGE as OIDC_POPUP_TOKEN,
  LOGIN_SURROGATE_FEATURES as OIDC_POPUP_FEATURES,
  LOGIN_SURROGATE_MARKER as OIDC_POPUP_MARKER,
  LOGIN_WATCH_INTERVAL as OIDC_POPUP_WATCH_INTERVAL,
} from '@owlmeans/client-auth/login'

export enum OidcAuthPurposes {
  Unknown = 'unknown',
  Subscribe = 'subscribe',
  Login = 'login'
}
