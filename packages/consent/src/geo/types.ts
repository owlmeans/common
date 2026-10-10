import type { ConsentGeoPlugin, ConsentOptions, ConsentRecord } from '../types.js'

/** What locating the visitor decided: ask them, or decide for them automatically. */
export type ConsentGeoVerdict = 'ask' | 'auto'

/** Whether a record is an automatic decision, and whether it is still trusted. */
export type ConsentAutoState = 'fresh' | 'stale'

/**
 * Asking only where the law requires it: locating the visitor, the decision that follows, and the
 * automatic record written where nobody needs to be asked.
 */
export interface ConsentGeoHelper {
  /** Whether `opts.geo` turns the gate on AND something can answer — the Cloudflare locator or a plugin. */
  enabled: (opts?: ConsentOptions) => boolean
  /** Every `key=value` line of a Cloudflare trace body. Never throws; anything else parses to `{}`. */
  parseTrace: (text: string) => Record<string, string>
  /**
   * The built-in locator: a same-origin GET of the trace endpoint, cookies left out, never cached.
   * Rejects when `opts.geo.cloudflare` is off, the request fails or answers non-2xx, or the body is
   * not a trace (an SPA serving its `index.html` for every path answers 200 here).
   */
  cloudflareLocator: () => ConsentGeoPlugin
  /**
   * Whether a visitor located in `country` must be asked: yes inside `opts.geo.countries`
   * (`CONSENT_REQUIRED_COUNTRIES`), and yes for anything that names no country.
   */
  requiresConsent: (country: string | null, opts?: ConsentOptions) => boolean
  /**
   * Locate and decide, bounded by `opts.geo.timeout`. Never rejects: a visitor nobody could locate
   * resolves `'ask'`.
   */
  decide: (opts: ConsentOptions) => Promise<ConsentGeoVerdict>
  /**
   * Whether the browser sends Global Privacy Control — a legally binding opt-out in several US
   * states, so an automatic decision honours it.
   */
  privacySignal: () => boolean
  /**
   * The automatic decision for a visitor nobody needs to ask: every category on — or, under Global
   * Privacy Control, only the required ones — stamped `auto` with the current time.
   */
  automaticRecord: (opts?: ConsentOptions) => ConsentRecord
  /**
   * `fresh` for an automatic decision younger than `CONSENT_AUTO_MAX_AGE`, `stale` for an older one
   * (or one stamped in the future beyond the skew), `null` for an explicit record or none.
   */
  autoState: (record: ConsentRecord | null) => ConsentAutoState | null
}
