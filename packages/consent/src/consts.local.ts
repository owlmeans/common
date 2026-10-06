export const CONSENT_LINK_VERSION = 2

/** A BCP 47-shaped tag: a 2–3 letter language and up to three subtags (`pl`, `pt-BR`, `zh-Hant-TW`). */
export const LANGUAGE_TAG = /^[a-z]{2,3}(?:[-_][a-z0-9]{1,8}){0,3}$/i
