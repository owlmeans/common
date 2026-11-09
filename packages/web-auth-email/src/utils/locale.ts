import { EMAIL_LOCALE_MAX_LENGTH } from '@owlmeans/auth-email'

/**
 * The language a request names for its mail: the base language of the interface's (`de-AT` → `de`),
 * or nothing when there is none to name — the server then writes in English.
 */
export const wireLocale = (locale?: string): string | undefined => {
  const base = locale?.trim().split(/[-_]/)[0]?.toLowerCase()

  return base != null && base !== '' && base.length <= EMAIL_LOCALE_MAX_LENGTH ? base : undefined
}
