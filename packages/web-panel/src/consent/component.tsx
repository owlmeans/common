import type { FC } from 'react'
import { CookieConsent, CookiePolicy } from '@owlmeans/web-consent'
import type { CookieConsentProps, CookiePolicyProps, ConsentLocale } from '@owlmeans/web-consent'
import { useLanguage } from '@owlmeans/client-i18n'
import { SUPPORTED_LNGS } from '@owlmeans/i18n'
import { useContext } from '../context.js'
import type { AppConfig, AppContext } from '../types.js'
import { useConsentTranslate } from './translate.js'
import { useConsentWidgetPresent } from './presence.js'
import type { ConsentWidgetServiceAppend } from './types.js'

interface BoundCookieConsentProps extends CookieConsentProps {
  /** Whether a host menu currently offers the preferences row — see `useConsentMenuPresence`. */
  menuPresent?: boolean
}

const BoundCookieConsent: FC<BoundCookieConsentProps> = ({ menuPresent, ...props }) => {
  const [lng] = useLanguage()
  const locale = props.locale ?? lng
  const translate = useConsentTranslate(locale, props.translate)

  return <CookieConsent
    {...props}
    locale={locale}
    translate={translate}
    noReopenButton={props.noReopenButton ?? menuPresent}
  />
}

const MenuAwareCookieConsent: FC<CookieConsentProps> = props =>
  <BoundCookieConsent {...props} menuPresent={useConsentWidgetPresent()} />

/**
 * The consent dialog, bound to this application's language and translations.
 *
 * `@owlmeans/web-consent` deliberately knows nothing about OwlMeans i18n — one of its consumers is
 * an Astro site with none — so this is where the two meet.
 *
 * Also hides the floating re-open button whenever a host menu declares, through
 * `useConsentMenuPresence()`, that it offers a `PanelConsentMenuWidget` row (a collapsed dropdown,
 * a footer "Cookie settings" control) — an explicit `noReopenButton` from the caller always wins;
 * only the default `undefined` falls through to this computed presence.
 *
 * The presence read needs `appendConsentWidgetService(context)`, and an application mounting the
 * dialog on its own has no reason to call it. Without the service the dialog is exactly the plain
 * bound dialog, floating button included — never a presence read against a state resource that
 * was never registered, which throws inside render and blanks the whole application. The choice is
 * made by component TYPE, because it is fixed for the context's lifetime: a service is appended
 * while the context is built, before anything renders.
 */
export const PanelCookieConsent: FC<CookieConsentProps> = props => {
  const context = useContext<AppConfig, AppContext<AppConfig> & Partial<ConsentWidgetServiceAppend>>()

  return typeof context.consentWidget === 'function'
    ? <MenuAwareCookieConsent {...props} />
    : <BoundCookieConsent {...props} />
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
