export * from './component.js'
export {
  useConsent, useConsentCategory, consentStore, openConsent, isConsented,
  readConsent, writeConsent, clearConsent, DEFAULT_CONSENT_CATEGORIES,
  CONSENT_KEY, CONSENT_ESSENTIAL, CONSENT_ANALYTICS, CONSENT_MARKETING,
  consentBootstrapScript,
} from '@owlmeans/web-consent'
export type {
  ConsentCategory, ConsentOptions, ConsentRecord, ConsentSignal, ConsentState,
  CookieConsentProps, CookiePolicyProps,
} from '@owlmeans/web-consent'
