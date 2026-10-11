import type { FC } from 'react'
import { ConsentMenuWidget } from '@owlmeans/web-consent'
import type { ConsentMenuWidgetProps } from '@owlmeans/web-consent'
import { useLanguage } from '@owlmeans/client-i18n'
import { useConsentTranslate } from './translate.js'

/**
 * The cookie-preferences row for a host's own dropdown/menu, bound to this app's language.
 *
 * Purely the visual row — it carries no presence signalling of its own, since it is typically
 * rendered inside a dropdown's lazily-mounted content (only present while the menu is actually
 * open). A host that wants `PanelCookieConsent`'s floating button hidden for the whole time this
 * row is REACHABLE (not just while the dropdown happens to be open) calls
 * `useConsentMenuPresence()` from its own always-mounted menu shell instead.
 */
export const PanelConsentMenuWidget: FC<ConsentMenuWidgetProps> = props => {
  const [lng] = useLanguage()
  const locale = props.locale ?? lng
  const translate = useConsentTranslate(locale, props.translate)

  return <ConsentMenuWidget {...props} locale={locale} translate={translate} />
}
