import type { ClientConfig } from '@owlmeans/client-context'
import { DEFAULT_LNG, LIB_NAMESPACE, i18nHelper } from '@owlmeans/i18n'
import { i18nInstanceHelper } from '@owlmeans/client-i18n/utils'
import { LOGIN_I18N_RESOURCE } from './consts.local.js'
import type { LoginTranslate } from './types.js'

/**
 * A translate over the `auth` library resource that reads no React context.
 *
 * For a sign-in surface that renders outside any screen binding a `translate` — a dispatcher's
 * failed exchange, a plugin's own form — where a hook that reaches for an i18n provider would throw
 * inside render in an app mounted without one. It reads the app's one i18next instance
 * (`i18nInstanceHelper.getI18nInstance`, the same instance `useI18nLib` drives) and drains the
 * `auth` bundle into it when no component has yet: `initI18nResource` is one-shot per slot, so
 * whichever of the two runs first loads it and the other no-ops. App-tier overrides of the `auth`
 * keys (`addI18nApp(lng, 'auth', …, { ns: LIB_NAMESPACE })`) resolve here as everywhere else.
 */
export const makeAuthTranslate = (cfg: ClientConfig): LoginTranslate => {
  const i18n = i18nInstanceHelper.getI18nInstance(cfg)
  const fallback = typeof i18n.options?.fallbackLng === 'string' ? i18n.options.fallbackLng : DEFAULT_LNG
  for (const lng of new Set([i18n.language, fallback])) {
    if (lng == null) {
      continue
    }
    i18nHelper.initI18nResource(lng, LOGIN_I18N_RESOURCE, LIB_NAMESPACE)?.forEach(resource => i18n.addResourceBundle(
      lng, LIB_NAMESPACE, { [LOGIN_I18N_RESOURCE]: resource.data }, true, true
    ))
  }

  return (key, defaultValue) =>
    i18n.t(`${LOGIN_I18N_RESOURCE}.${key}`, { ns: LIB_NAMESPACE, defaultValue })
}
