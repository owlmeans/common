import { consentPluginHelper, type ConsentGeoPlugin } from '@owlmeans/web-consent'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '@owlmeans/client'
import type { ConsentGeoPluginAppend } from './types.js'

/**
 * Add the application's own country locator while its context is configured — beside
 * `appendConsentWidgetService`, before anything renders.
 *
 * A locator is one async method that resolves the visitor's country or throws
 * (`ConsentGeoPlugin`). It is registered into `@owlmeans/consent`'s plugin registry, ahead of the
 * built-in Cloudflare one, and `PanelCookieConsent` turns the geo gate on for it even where
 * `cfg.cookieConsent.geo` says nothing — appending a locator IS asking for the gate. Its result
 * decides as Cloudflare's would: a visitor in a consent country is asked, anyone else is decided for
 * automatically, and a throw hands over to the next locator — with none left, the visitor is asked.
 */
export const appendConsentGeoPlugin = <C extends ClientConfig, T extends ClientContext<C>>(
  ctx: T, plugin: ConsentGeoPlugin
): T & ConsentGeoPluginAppend => {
  const _ctx = ctx as T & ConsentGeoPluginAppend

  consentPluginHelper.registerConsentPlugin(plugin)
  _ctx.consentGeo = () => plugin

  return _ctx
}
