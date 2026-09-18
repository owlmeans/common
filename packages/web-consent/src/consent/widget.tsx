import { useCallback } from 'react'
import type { FC } from 'react'
import { Cookie } from 'lucide-react'
import { defaultConsentTranslate, openConsent } from '@owlmeans/consent'
import { cn } from '../lib/utils.js'
import type { ConsentMenuWidgetProps } from '../types.js'

/**
 * One row a HOST'S OWN menu can render to reopen the preferences dialog, in place of (or beside)
 * the floating button `CookieConsent` renders itself. No outer row padding here — the host's own
 * menu-row wrapper supplies that, the same way it does for any other widget row it renders.
 *
 * Carries no presence signalling of its own: a host whose menu only mounts this row while its
 * dropdown/menu content is actually open (Radix's `DropdownMenuContent`, for one) would report
 * "present" only for that brief window. A host that wants to hide `CookieConsent`'s floating
 * button while this row is reachable announces that from whatever component of its own stays
 * mounted for the menu's whole lifetime — see `useConsentMenuPresence` in `@owlmeans/web-panel/consent`.
 *
 * Uses `openConsent` directly rather than the `useConsent()` hook: that hook's mount itself
 * triggers `consentStore.init()`, which a row that only needs to trigger a reopen must not do.
 */
export const ConsentMenuWidget: FC<ConsentMenuWidgetProps> = props => {
  const t = props.translate ?? defaultConsentTranslate(props.locale)

  const onClick = useCallback(() => {
    if (props.onSelect != null) {
      props.onSelect()
      return
    }
    openConsent('reopen')
  }, [props.onSelect])

  return <button
    type="button" onClick={onClick} data-consent-menu-widget
    className={cn(
      'flex w-full min-w-0 items-center gap-2 rounded-md text-left text-sm text-popover-foreground transition-colors hover:bg-accent',
      props.className
    )}
  >
    <Cookie className="h-4 w-4 shrink-0" aria-hidden="true" />
    <span className="flex-1 truncate">{props.label ?? t('openPreferences', 'Cookie preferences')}</span>
  </button>
}
