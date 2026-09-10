import { consentBootstrapScript } from '@owlmeans/consent'
import type { ConsentOptions } from '@owlmeans/consent'
import { gtmHeadScript, gtmNoscriptFrame } from '@owlmeans/web-gtm'
import type { GtmOptions } from '@owlmeans/web-gtm'

/**
 * Astro-side wiring for the OwlMeans browser packages.
 *
 * Astro's model is HTML first and islands second, which is the opposite of every other consumer of
 * these packages — so the parts that have to run before hydration (the consent defaults, the tag
 * container) cannot come from a component at all. This package is where those become strings a
 * layout can stamp with `set:html`, plus the small conversions between Astro's vocabulary and this
 * framework's.
 *
 * Nothing here imports Astro. It would make the package unusable outside one, and everything it
 * needs is a value the caller already has.
 */

export interface HeadScripts {
  /** Inline `<script>` content for `<head>`. Consent defaults first, then the container. */
  head: string
  /** `<noscript>` content for the top of `<body>`. Empty when no container is configured. */
  noscript: string
}

/**
 * Everything a page has to put in its head, in the one order that works.
 *
 * Pass no `gtm` and it is just the consent defaults — which a site still wants, because a stored
 * decision has to reach any tag the page loads later.
 */
export const owlHeadScripts = (opts?: { gtm?: GtmOptions, consent?: ConsentOptions }): HeadScripts =>
  opts?.gtm != null
    ? { head: gtmHeadScript({ ...opts.consent, ...opts.gtm }), noscript: gtmNoscriptFrame(opts.gtm) }
    : { head: consentBootstrapScript(opts?.consent), noscript: '' }

/**
 * Whether this page must carry no tracking at all.
 *
 * A legal page is where a visitor goes to READ what is being collected; collecting there while
 * they read is the one thing it must not do. The pattern matches `/legal/...` with or without a
 * locale prefix, which is how these sites address them.
 */
export const isLegalPath = (pathname: string, segment = 'legal'): boolean =>
  new RegExp(`^/(?:[a-z]{2}/)?${segment}(?:/|$)`).test(pathname)

/**
 * Astro's locale, as this framework's.
 *
 * `Astro.currentLocale` is undefined on a default-locale page rather than the default locale, so a
 * component fed it directly renders English for everyone on `/` — including the sites where `/` is
 * not English.
 */
export const owlLocale = (currentLocale: string | undefined, fallback = 'en'): string =>
  currentLocale != null && currentLocale !== '' ? currentLocale : fallback

export type { GtmOptions } from '@owlmeans/web-gtm'
export type { ConsentOptions, ConsentCategory } from '@owlmeans/consent'
