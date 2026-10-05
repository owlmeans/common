import type { CookieConsentProps } from '@owlmeans/web-consent'

export interface BoundCookieConsentProps extends CookieConsentProps {
  /** Whether a host menu currently offers the preferences row — see `useConsentMenuPresence`. */
  menuPresent?: boolean
}
