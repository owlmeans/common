import type { ConsentOptions } from '@owlmeans/consent'

/** `'gtm'` container / `'gtag'` — see {@link GtmOptions.mode} / {@link GoogleTagOptions.mode}. */
export type GoogleTagMode = 'basic' | 'advanced'

export interface GtmOptions extends ConsentOptions {
  /** Container id, e.g. `GTM-XXXXXXX`. */
  id: string
  /** The queue name, when a page runs more than one container. */
  dataLayerName?: string
  /** See {@link GOOGLE_TAG_DEFAULT_MODE}. Defaults to `GOOGLE_TAG_DEFAULT_MODE` (`'basic'`). */
  mode?: GoogleTagMode
}

/**
 * Which loader an id takes: `gtm` is the Tag Manager container (`gtm.js`), `gtag` the Google tag
 * (`gtag.js`) — Google Analytics 4 (`G-`), a Google tag (`GT-`), Google Ads (`AW-`) and
 * Floodlight (`DC-`).
 */
export type GoogleTagKind = 'gtm' | 'gtag'

export interface GoogleTagOptions extends ConsentOptions {
  /** `GTM-…`, `G-…`, `GT-…`, `AW-…` or `DC-…` — see {@link isGoogleTagId}. */
  id: string
  /**
   * The queue name, when a page runs more than one tag. Consent Mode from `@owlmeans/consent` —
   * the bootstrap AND the dialog's later updates — always speaks on `window.dataLayer`, so a tag
   * given another queue never hears a consent command. Leave it unset on a consent-gated page.
   */
  dataLayerName?: string
  /** See {@link GOOGLE_TAG_DEFAULT_MODE}. Defaults to `GOOGLE_TAG_DEFAULT_MODE` (`'basic'`). */
  mode?: GoogleTagMode
}
