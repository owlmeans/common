import type { FC } from 'react'
import {
  CookieConsent, CookiePolicy, type ConsentGeoOptions, type CookieConsentProps, type CookiePolicyProps,
} from '@owlmeans/web-consent'
import { useLanguage } from '@owlmeans/client-i18n'
import { useContext } from '../context.js'
import type { AppConfig, AppContext } from '../types.js'
import { useConsentTranslate } from './translate.js'
import { useConsentWidgetPresent } from './presence.js'
import type { ConsentGeoPluginAppend, ConsentWidgetServiceAppend } from './types.js'
import { _localeParity } from './consts.local.js'
import type { BoundCookieConsentProps } from './types.local.js'

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
 * The geo gate in force: the prop, else `cfg.cookieConsent.geo`, else — when the application
 * appended a locator of its own — the gate with nothing but that locator.
 */
const geoOf = (
  prop: ConsentGeoOptions | undefined, context: AppContext<AppConfig> & Partial<ConsentGeoPluginAppend>
): ConsentGeoOptions | undefined =>
  prop ?? context.cfg.cookieConsent?.geo ?? (typeof context.consentGeo === 'function' ? {} : undefined)

void _localeParity

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
  const context = useContext<
    AppConfig, AppContext<AppConfig> & Partial<ConsentWidgetServiceAppend & ConsentGeoPluginAppend>
  >()
  const mode = props.mode ?? context.cfg.cookieConsent?.mode
  const geo = geoOf(props.geo, context)
  const bound = { ...props, ...(mode != null ? { mode } : {}), ...(geo != null ? { geo } : {}) }

  return typeof context.consentWidget === 'function'
    ? <MenuAwareCookieConsent {...bound} />
    : <BoundCookieConsent {...bound} />
}

/**
 * The cookie-policy page, bound like the dialog — and told about the geo gate the same way, so it
 * states the regional rule exactly when the dialog applies it.
 */
export const PanelCookiePolicy: FC<CookiePolicyProps> = props => {
  const context = useContext<AppConfig, AppContext<AppConfig> & Partial<ConsentGeoPluginAppend>>()
  const [lng] = useLanguage()
  const locale = props.locale ?? lng
  const translate = useConsentTranslate(locale, props.translate)
  const geo = geoOf(props.geo, context)

  return <CookiePolicy {...props} {...(geo != null ? { geo } : {})} locale={locale} translate={translate} />
}
