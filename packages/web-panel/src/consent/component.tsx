import { useCallback } from 'react'
import type { FC } from 'react'
import { CookieConsent, CookiePolicy, defaultConsentTranslate } from '@owlmeans/web-consent'
import type { CookieConsentProps, CookiePolicyProps, ConsentLocale } from '@owlmeans/web-consent'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import { SUPPORTED_LNGS } from '@owlmeans/i18n'

/**
 * Resolve consent copy through the application first, and the packaged bundle second.
 *
 * The chain matters. `@owlmeans/web-consent` takes `translate` as a prop and, once given one,
 * stops consulting its own translations — so a wrapper that forwarded the framework resolver
 * alone would render the ENGLISH default for every key the application had not overridden, in
 * every language. Falling through to the packaged bundle for the current locale means an
 * application overrides what it wants to and inherits seven languages for the rest.
 */
const useConsentTranslate = (
  locale: string, override?: (key: string, defaultValue: string) => string
): ((key: string, defaultValue: string) => string) => {
  const t = useI18nLib('consent')

  return useCallback((key: string, defaultValue: string) => {
    if (override != null) {
      return override(key, defaultValue)
    }
    const packaged = defaultConsentTranslate(locale)(key, defaultValue)
    // `t` answers with whatever it is given when the key is unknown, so the packaged string is
    // what it is given — an application's override wins, and everything else stays translated.
    return t(key, { defaultValue: packaged })
  }, [t, locale, override])
}

/**
 * The consent dialog, bound to this application's language and translations.
 *
 * `@owlmeans/web-consent` deliberately knows nothing about OwlMeans i18n — one of its consumers is
 * an Astro site with none — so this is where the two meet.
 */
export const PanelCookieConsent: FC<CookieConsentProps> = props => {
  const [lng] = useLanguage()
  const locale = props.locale ?? lng
  const translate = useConsentTranslate(locale, props.translate)

  return <CookieConsent {...props} locale={locale} translate={translate} />
}

export const PanelCookiePolicy: FC<CookiePolicyProps> = props => {
  const [lng] = useLanguage()
  const locale = props.locale ?? lng
  const translate = useConsentTranslate(locale, props.translate)

  return <CookiePolicy {...props} locale={locale} translate={translate} />
}

/**
 * The consent package carries its own locale list because it must build with no dependency on the
 * i18n package at all. This assertion is what keeps the two from drifting: a language added to the
 * framework and not to the bundle fails here, at build time, rather than as a dialog rendering
 * English to the one reader who cannot report it.
 */
const _localeParity: readonly ConsentLocale[] = SUPPORTED_LNGS as readonly ConsentLocale[]
void _localeParity
