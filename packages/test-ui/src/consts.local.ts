export const DEFAULT_MARKETING_CONSENT_TIMEOUT = 30_000

export const DEFAULT_SUPERVISOR_PATH = '/authentication/login/pk-supervisor'

/** A consent country: a mocked visitor is asked unless the spec says otherwise. */
export const DEFAULT_CONSENT_GEO_COUNTRY = 'PL'

/** `@owlmeans/consent`'s `CONSENT_TRACE_PATH`, repeated: this package depends on no consent package. */
export const DEFAULT_CONSENT_TRACE_PATH = '/cdn-cgi/trace'

/** What `acceptConsent` treats as "nothing to answer": the store settled on a decision without UI. */
export const CONSENT_SETTLED_WITHOUT_UI = 'html[data-consent="decided"], html[data-consent="idle"]'

/** The e-mail method's own route (`@owlmeans/auth-email`'s `email` plugin on the typed authentication route). */
export const DEFAULT_EMAIL_LOGIN_PATH = '/authentication/login/email'

export const DEFAULT_DISPATCHER_PATH = '/dispatcher'

/** What an OwlMeans app shows once it has landed — the marker `answerMarketingConsent` races too. */
export const DEFAULT_LANDED_SELECTOR = '#app-prompt'

export const DEFAULT_EMAIL_LOGIN_TIMEOUT = 60_000
