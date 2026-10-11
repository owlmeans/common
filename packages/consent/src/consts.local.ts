export const CONSENT_LINK_VERSION = 2

/** A BCP 47-shaped tag: a 2–3 letter language and up to three subtags (`pl`, `pt-BR`, `zh-Hant-TW`). */
export const LANGUAGE_TAG = /^[a-z]{2,3}(?:[-_][a-z0-9]{1,8}){0,3}$/i

/** The built-in Cloudflare locator's registry alias. */
export const CLOUDFLARE_LOCATOR_ALIAS = 'cloudflare'

/** Below anything an application registers: an application's own locator always asks first. */
export const CLOUDFLARE_LOCATOR_PRIORITY = -100

/** An ISO 3166-1 alpha-2 code, upper case. */
export const COUNTRY_CODE = /^[A-Z]{2}$/

/** Clock skew tolerated on an automatic decision's timestamp, in seconds. */
export const AUTO_SKEW = 60
