import type { ResourceRecord } from '@owlmeans/resource'
import type { InitializedService } from '@owlmeans/context'
import type { ConsentDisplayMode, ConsentGeoOptions, ConsentGeoPlugin } from '@owlmeans/web-consent'

/**
 * `cfg.cookieConsent` — how the application's cookie consent asks, set where the rest of its
 * configuration is. A prop on `PanelCookieConsent` / `PanelCookiePolicy` always wins.
 */
export interface PanelCookieConsentConfig {
  /** `bar` (the default) or `window` — see `ConsentDisplayMode`. */
  mode?: ConsentDisplayMode
  /**
   * Ask only where the law requires it. `{ cloudflare: true }` locates the visitor through the
   * Cloudflare edge the application is served from; a locator of the application's own is added in
   * code with `appendConsentGeoPlugin`. See `ConsentGeoOptions`.
   */
  geo?: ConsentGeoOptions
}

/** What `appendConsentGeoPlugin` adds to the context. */
export interface ConsentGeoPluginAppend {
  /** The application's own locator, registered while the context was configured. */
  consentGeo: () => ConsentGeoPlugin
}

/** A `single`-store presence flag: one record, no id needed. */
export interface ConsentWidgetPresenceRecord extends ResourceRecord {
  present: boolean
}

export interface ConsentWidgetService extends InitializedService {
  /**
   * Register one mounted cookie-preferences menu row. Returns its release — call it exactly
   * once, on that instance's unmount.
   */
  claim: () => () => void
  /** Whether at least one row is currently mounted anywhere in the app. */
  present: () => boolean
}

export interface ConsentWidgetServiceAppend {
  consentWidget: () => ConsentWidgetService
}
