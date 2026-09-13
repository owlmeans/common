import { useLayoutEffect } from 'react'
import { useStoreModel } from '@owlmeans/client'
import { useContext } from '../context.js'
import { CONSENT_WIDGET_STATE } from './service.js'
import type { AppConfig, AppContext } from '../types.js'
import type { ConsentWidgetPresenceRecord, ConsentWidgetServiceAppend } from './types.js'

/**
 * Whether a cookie-preferences action is currently reachable elsewhere in this app — what
 * `PanelCookieConsent` reads to hide its own floating button while it is.
 *
 * Reads the state resource directly, never `useConsent()` — that hook's own mount triggers
 * `consentStore.init()` as a side effect, which this must not do.
 */
export const useConsentWidgetPresent = (): boolean => {
  const model = useStoreModel<ConsentWidgetPresenceRecord>(undefined, CONSENT_WIDGET_STATE)

  return model.record.present === true
}

/**
 * Declares that a cookie-preferences action is reachable for as long as the CALLING component
 * stays mounted.
 *
 * Call this from a component that is mounted for the whole time the action is reachable — a
 * dropdown/menu's own shell, not the menu's lazily-rendered content. Radix's `DropdownMenuContent`
 * (and most headless menu content primitives) only mount their children while the menu is actually
 * OPEN, so a `PanelConsentMenuWidget` row placed there is present for a fraction of the time the
 * menu itself is on screen — calling this hook from inside that row hid the floating button only
 * while the dropdown happened to be open, and showed it again the instant it closed.
 *
 * A layout effect, not a plain one: an ordinary effect runs after paint, so the floating button
 * would flash for one frame before a fresh mount reports presence.
 */
export const useConsentMenuPresence = (): void => {
  const context = useContext<AppConfig, AppContext<AppConfig> & ConsentWidgetServiceAppend>()

  useLayoutEffect(() => context.consentWidget().claim(), [context])
}
