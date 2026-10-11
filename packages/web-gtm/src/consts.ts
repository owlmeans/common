import type { GoogleTagMode } from './types.js'

/**
 * The platform default for {@link GtmOptions.mode} / {@link GoogleTagOptions.mode}.
 *
 * One named constant so flipping it later is a one-line change.
 *
 * - `'basic'` withholds the loader until a signal-bearing category is granted — which holds back
 *   Google's own IP receipt too, not only what a granted tag may then do with it.
 * - `'advanced'` loads immediately with Consent Mode signals denied — today's only behavior, and
 *   Google's own recommended default for its own conversion modeling.
 *
 * Default is `'basic'`: read it as the EU/DE worst-case reading of ePrivacy Art. 5(3) — no third
 * party receives a connection before consent.
 */
export const GOOGLE_TAG_DEFAULT_MODE: GoogleTagMode = 'basic'

/**
 * The hosts a page running a Google tag has to allow in `script-src`, `connect-src` and
 * `img-src`, for Google Analytics 4, Tag Manager and Google Ads together.
 *
 * Taken from Google's CSP guide (developers.google.com/tag-platform/security/guides/csp) and
 * folded into one list, because the platform adds one list to all three directives:
 *
 * - `*.googletagmanager.com` — gtm.js and gtag/js (`www.`), and their measurement pings;
 * - `*.google-analytics.com` — GA4 collection (`region1.`, `www.`);
 * - `*.g.doubleclick.net` — GA4 with Google signals and Ads (`stats.g.`, `googleads.g.`);
 * - `ad.doubleclick.net` — Ads and Floodlight conversions;
 * - `www.googleadservices.com` — the Ads conversion script;
 * - `pagead2.googlesyndication.com` — Ads and GA4-with-ads pings;
 * - `*.google.com` — `www.google.com` (the Ads script, consent-mode pings), `adservice.`, and the
 *   `analytics.google.com` collection endpoints.
 *
 * Every entry is an `https://` scheme, an optional `*.` label and a dotted host — the only shape
 * the publisher's CSP filter lets through — and there are few enough to stay inside its per-slot
 * cap. Google's country domains (`google.<TLD>`) cannot be named in that shape and are left out:
 * what is lost is a remarketing ping from visitors on those domains, never the tag itself.
 */
export const GOOGLE_TAG_CSP_SOURCES: readonly string[] = Object.freeze([
  'https://*.googletagmanager.com',
  'https://*.google-analytics.com',
  'https://*.g.doubleclick.net',
  'https://ad.doubleclick.net',
  'https://www.googleadservices.com',
  'https://pagead2.googlesyndication.com',
  'https://*.google.com',
])

/**
 * The hosts a Google tag frames: Tag Manager's service-worker and preview frames, and the Ads
 * remarketing frame. For `frame-src`, which otherwise stays `'none'`.
 */
export const GOOGLE_TAG_FRAME_SOURCES: readonly string[] = Object.freeze([
  'https://www.googletagmanager.com',
  'https://td.doubleclick.net',
])
