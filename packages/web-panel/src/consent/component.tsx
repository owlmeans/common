import type { FC } from 'react'
import { CookieConsent, CookiePolicy } from '@owlmeans/web-consent'
import type { CookieConsentProps, CookiePolicyProps, ConsentLocale } from '@owlmeans/web-consent'
import { useLanguage } from '@owlmeans/client-i18n'
import { SUPPORTED_LNGS } from '@owlmeans/i18n'
import { useConsentTranslate } from './translate.js'
import { useConsentWidgetPresent } from './presence.js'

/**
 * The consent dialog, bound to this application's language and translations.
 *
 * `@owlmeans/web-consent` deliberately knows nothing about OwlMeans i18n — one of its consumers is
 * an Astro site with none — so this is where the two meet.
 *
 * Also hides the floating re-open button whenever a `PanelConsentMenuWidget` is mounted somewhere
 * else in the app (a host's own collapsed dropdown menu, typically) — an explicit
 * `noReopenButton` from the caller always wins; only the default `undefined` falls through to
 * this computed presence.
 */
export const PanelCookieConsent: FC<CookieConsentProps> = props => {
  const [lng] = useLanguage()
  const locale = props.locale ?? lng
  const translate = useConsentTranslate(locale, props.translate)
  const menuPresent = useConsentWidgetPresent()

  return <CookieConsent
    {...props}
    locale={locale}
    translate={translate}
    noReopenButton={props.noReopenButton ?? menuPresent}
  />
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
