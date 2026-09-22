import { useCallback } from 'react'
import { defaultConsentTranslate } from '@owlmeans/web-consent'
import { useI18nLib } from '@owlmeans/client-i18n'

/**
 * Resolve consent copy through the application first, and the packaged bundle second.
 *
 * The chain matters. `@owlmeans/web-consent` takes `translate` as a prop and, once given one,
 * stops consulting its own translations — so a wrapper that forwarded the framework resolver
 * alone would render the ENGLISH default for every key the application had not overridden, in
 * every language. Falling through to the packaged bundle for the current locale means an
 * application overrides what it wants to and inherits the packaged languages for the rest.
 *
 * Shared by `PanelCookieConsent`/`PanelCookiePolicy` and `PanelConsentMenuWidget` — every
 * `web-panel/consent` surface resolves copy through this one chain.
 */
export const useConsentTranslate = (
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
