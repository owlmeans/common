import { getExplicitLanguage, persistLanguage, setLanguage, setLanguagePersistence } from '@owlmeans/client-i18n'
import { CONSENT_EVENT, CONSENT_LANGUAGE_EVENT, functionalGranted } from '@owlmeans/web-consent'
import type { ConsentOptions } from '@owlmeans/web-consent'

/**
 * Bind the application's language to the visitor's cookie choice: a language is remembered on their
 * device only while they have granted `functional` storage.
 *
 * It does three things, and the order they take effect in is the point:
 *
 * 1. Installs the persistence guard in `@owlmeans/client-i18n` — so the language switcher (which
 *    calls `setLanguage`) stops writing `owlmeans-lng` until functional is granted, and a stored
 *    language counts as absent while it is not. **Call it BEFORE `prepareI18n`**: the initial
 *    language is resolved from storage right there.
 * 2. On every consent change (`CONSENT_EVENT`) writes the choice the visitor made while storage was
 *    refused, if it is allowed now — a person who picked a language, then answered the dialog with
 *    "accept all", keeps it.
 * 3. On `CONSENT_LANGUAGE_EVENT` — a language that arrived with a link and was waiting for the grant —
 *    switches to it now, unless the person has already picked one in this page's life: what they
 *    chose outranks what a link carried, and that choice is re-written over the store's own write.
 *
 * Returns a function that undoes all three. Safe on the server (only the guard is installed).
 */
export const installConsentLanguage = (opts?: ConsentOptions): (() => void) => {
  setLanguagePersistence(() => functionalGranted(opts))

  if (typeof window === 'undefined') {
    return () => setLanguagePersistence(null)
  }

  const onConsent = (): void => {
    persistLanguage()
  }
  const onLanguage = (event: Event): void => {
    const carried = (event as CustomEvent<{ language?: string }>).detail?.language
    const chosen = getExplicitLanguage()
    const language = chosen ?? carried
    if (typeof language !== 'string' || language === '') {
      return
    }
    setLanguage(language).catch((error: unknown) => {
      console.error('[i18n] could not apply the language that was waiting for consent', error)
    })
  }
  window.addEventListener(CONSENT_EVENT, onConsent)
  window.addEventListener(CONSENT_LANGUAGE_EVENT, onLanguage)

  return () => {
    window.removeEventListener(CONSENT_EVENT, onConsent)
    window.removeEventListener(CONSENT_LANGUAGE_EVENT, onLanguage)
    setLanguagePersistence(null)
  }
}
