import type { ConsentOptions } from '@owlmeans/consent'

/**
 * A tag a page loads, already rendered as the two strings a layout stamps.
 *
 * A tag package builds it from the same {@link ConsentOptions} the page passes here, because `head`
 * replaces the plain consent bootstrap: it has to declare its own signal defaults and the stored
 * decision FIRST and only then run its loader, as one inline script. This package never inspects
 * either string. A tag package may also render a head with no loader at all — its signal defaults
 * alone, for a page whose tag arrives later.
 */
export interface HeadTag {
  /** Inline `<script>` content for `<head>`: the tag's consent bootstrap, then its loader. */
  head: string
  /** `<noscript>` content for the top of `<body>`; `''` when the tag has no script-less form. */
  noscript: string
}

export interface HeadScripts {
  /**
   * Inline `<script>` content for `<head>`: consent's neutral bootstrap (the linker fragment and
   * a stored decision written onto the category globals — no signal of any vendor) — or, when a
   * tag is passed, the tag's own `head`, which carries its signal defaults and the stored decision
   * ahead of its loader. Safe to stamp with `set:html` as it is when the configured values carry no
   * `</script`.
   */
  head: string
  /**
   * `<noscript>` content for the top of `<body>`. Empty without a tag, and empty whenever the tag
   * has no script-less form. Stamp it as `<noscript set:html={tags.noscript} />` rather than
   * writing a fallback by hand.
   */
  noscript: string
  /**
   * The standalone adopt-and-strip fragment (`consentLinkerScript`) — empty unless
   * `consent.linker` is set. `head` built with the same consent options already carries the SAME
   * fragment (the neutral bootstrap first, a tag's bootstrap right after its defaults), so this
   * exists for a page that has to adopt regardless of whether it also runs a tag: stamp it FIRST,
   * ahead of `head`, on every page a layout renders — legal pages included, since adopting a
   * cross-domain cookie choice is not itself tracking. A page that also stamps `head` runs this
   * fragment twice with no double effect: the second attempt finds the parameter already stripped
   * and does nothing.
   */
  adopt: string
}

/** What a page's head is built from: a tag to load, and the consent settings it obeys. */
export interface HeadScriptsOptions {
  /**
   * The tag to load, rendered by its tag package with the same `consent` options. Absent = consent's
   * neutral bootstrap alone.
   */
  tag?: HeadTag
  consent?: ConsentOptions
}

/** The Astro-side wiring of the OwlMeans browser packages: consent and head tag. */
export interface AstroHelper {
  /**
   * Everything a page has to put in its head, in the one order that works.
   *
   * Pass no `tag` and it is consent's neutral bootstrap — the linker's adoption and a stored decision
   * on the category globals, declaring no vendor's signals. A page that wants a vendor's signal
   * defaults in place for a tag it loads later passes that vendor package's signal-only head as
   * `tag`. Pass a `tag` and its `head` and `noscript` are returned as they are; `adopt` is built from
   * `consent` either way.
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
