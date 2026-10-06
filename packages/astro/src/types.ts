import type { ConsentOptions } from '@owlmeans/consent'
import type { GoogleTagOptions } from '@owlmeans/web-gtm'

export interface HeadScripts {
  /**
   * Inline `<script>` content for `<head>`: the consent defaults, the ads-redaction flags, then the
   * tag loader — gated behind consent in `'basic'` mode, immediate in `'advanced'`. Safe to stamp
   * with `set:html` as it is.
   */
  head: string
  /**
   * `<noscript>` content for the top of `<body>`. Empty when no container is configured, when the
   * id is not a Tag Manager container (gtag.js has no frame), and in `'basic'` mode — a browser
   * without JavaScript cannot have granted anything, so a frame would load the container without
   * consent. Stamp it as `<noscript set:html={tags.noscript} />` rather than writing the frame by
   * hand.
   */
  noscript: string
  /**
   * The standalone adopt-and-strip fragment (`consentLinkerScript`) — empty unless
   * `consent.linker` is set. `head` already carries the SAME fragment when a tag is configured
   * (`consentBootstrapScript` embeds it right after the consent defaults), so this exists for a
   * page that has to adopt regardless of whether it also runs a tag: stamp it FIRST, ahead of
   * `head`, on every page a layout renders — legal pages included, since adopting a cross-domain
   * cookie choice is not itself tracking. A page that also stamps `head` runs this fragment twice
   * with no double effect: the second attempt finds the parameter already stripped and does
   * nothing.
   */
  adopt: string
}

/** What a page's head is built from: a tag container to load, and the consent settings it obeys. */
export interface HeadScriptsOptions {
  /** The Google tag to load: `GTM-…`, `G-…`, `GT-…`, `AW-…` or `DC-…`; its `mode` defaults to `'basic'`. */
  gtm?: GoogleTagOptions
  consent?: ConsentOptions
}

/** The Astro-side wiring of the OwlMeans browser packages. */
export interface AstroHelper {
  /**
   * Everything a page has to put in its head, in the one order that works.
   *
   * Pass no `gtm` and it is just the consent defaults — which a site still wants, because a stored
   * decision has to reach any tag the page loads later.
   *
   * Throws when `gtm.id` is not a loadable Google tag id, so a mistyped id fails the build instead
   * of shipping pages with no tag.
   *
   * In `'basic'` mode (the default) the tag loads only after a consenting visit, so a page counts
   * as tagged in the tag manager's coverage report only once a consenting visitor has opened it.
   * A script that redirects BEFORE `head` runs leaves the URL it redirected away from untagged —
   * so never redirect from a URL that already names its locale.
   */
  owlHeadScripts: (opts?: HeadScriptsOptions) => HeadScripts
  /**
   * Whether this page must carry no tracking at all.
   *
   * A legal page is where a visitor goes to READ what is being collected; collecting there while
   * they read is the one thing it must not do. The pattern matches `/legal/...` with or without a
   * locale prefix, which is how these sites address them.
   */
  isLegalPath: (pathname: string, segment?: string) => boolean
  /**
   * Astro's locale, as this framework's.
   *
   * `Astro.currentLocale` is undefined on a default-locale page rather than the default locale, so a
   * component fed it directly renders English for everyone on `/` — including the sites where `/` is
   * not English.
   */
  owlLocale: (currentLocale: string | undefined, fallback?: string) => string
}
