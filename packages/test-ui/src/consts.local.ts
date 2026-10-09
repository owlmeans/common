export const DEFAULT_MARKETING_CONSENT_TIMEOUT = 30_000

export const DEFAULT_SUPERVISOR_PATH = '/authentication/login/pk-supervisor'

/** A consent country: a mocked visitor is asked unless the spec says otherwise. */
export const DEFAULT_CONSENT_GEO_COUNTRY = 'PL'

/** `@owlmeans/consent`'s `CONSENT_TRACE_PATH`, repeated: this package depends on no consent package. */
export const DEFAULT_CONSENT_TRACE_PATH = '/cdn-cgi/trace'

/** What `acceptConsent` treats as "nothing to answer": the store settled on a decision without UI. */
export const CONSENT_SETTLED_WITHOUT_UI = 'html[data-consent="decided"], html[data-consent="idle"]'
