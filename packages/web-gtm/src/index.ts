import {
  CONSENT_ANALYTICS, CONSENT_MARKETING, consentBootstrapScript, consentGateScript, consentStore,
  trackingGranted,
} from '@owlmeans/consent'
import type { ConsentOptions, ConsentService } from '@owlmeans/consent'

/** `'gtm'` container / `'gtag'` — see {@link GtmOptions.mode} / {@link GoogleTagOptions.mode}. */
export type GoogleTagMode = 'basic' | 'advanced'

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

export interface GtmOptions extends ConsentOptions {
  /** Container id, e.g. `GTM-XXXXXXX`. */
  id: string
  /** The queue name, when a page runs more than one container. */
  dataLayerName?: string
  /** See {@link GOOGLE_TAG_DEFAULT_MODE}. Defaults to `GOOGLE_TAG_DEFAULT_MODE` (`'basic'`). */
  mode?: GoogleTagMode
}

/** Google's own container IIFE, the id and queue name injected as JSON data. */
const gtmContainerScript = (layer: string, id: string): string =>
  `(function(w,d,s,l,i){w[l]=w[l]||[];` +
  `w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
  `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),` +
  `dl=l!='dataLayer'?'&l='+l:'';j.async=true;` +
  `j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;` +
  `f.parentNode.insertBefore(j,f)})` +
  `(window,document,'script',${JSON.stringify(layer)},${JSON.stringify(id)})`

/**
 * The inline `<head>` snippet, consent first and the container second.
 *
 * The ORDER is the whole point of this package. Google Tag Manager decides what a tag may do from
 * the consent state present when the container loads, and a React bundle cannot get there first —
 * by the time an island mounts, the container has been running for hundreds of milliseconds. A
 * site whose defaults arrive after `gtm.js` is not configured differently; it is unconfigured for
 * the window that matters, and nothing in the page reports it.
 *
 * Emit this into the document head, above everything else, as an inline script.
 *
 * In `GOOGLE_TAG_DEFAULT_MODE` (`'basic'`) the container is not requested at all until a
 * signal-bearing category is granted — {@link consentGateScript} wraps it, reading any stored
 * decision immediately and otherwise waiting for `@owlmeans/consent`'s `CONSENT_EVENT`. Pass
 * `mode: 'advanced'` for the original, unconditional load.
 */
export const gtmHeadScript = (opts: GtmOptions): string => {
  const bootstrap = consentBootstrapScript(opts)
  const loader = gtmContainerScript(opts.dataLayerName ?? 'dataLayer', opts.id)

  if ((opts.mode ?? GOOGLE_TAG_DEFAULT_MODE) === 'basic') {
    return `${bootstrap};${consentGateScript(loader, opts)}`
  }

  return `${bootstrap};${loader}`
}

/**
 * The `<noscript>` iframe, for the body.
 *
 * In `'basic'` mode this is an empty string: the whole point of gating is that an unauthenticated
 * `<noscript>` iframe would defeat it — a browser with JavaScript disabled cannot have granted
 * anything, so there is nothing lawful left to render. `'advanced'` keeps the frame.
 */
export const gtmNoscriptFrame = (opts: GtmOptions): string => {
  if ((opts.mode ?? GOOGLE_TAG_DEFAULT_MODE) === 'basic') {
    return ''
  }

  return `<iframe src="https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(opts.id)}"` +
    ` height="0" width="0" style="display:none;visibility:hidden"></iframe>`
}

/**
 * Load the container from script, for a host that cannot emit into its own head.
 *
 * The head snippet is strictly better and should be preferred; this exists for a single-page app
 * whose HTML is not ours to edit. It still pushes the defaults first, and it still refuses to load
 * a second time.
 *
 * In `'basic'` mode the container element is not appended until `trackingGranted` is true: either
 * the stored record already grants it, or — since this runs after the bundle mounted, past the
 * window the head snippet exists to close — a subscription to `consentStore` catches the first
 * update where it becomes true and unsubscribes. `'advanced'` appends it immediately, as before.
 */
export const loadGtm = (opts: GtmOptions): void => {
  if (typeof document === 'undefined') {
    return
  }
  const marker = `owl-gtm-${opts.id}`
  if (document.getElementById(marker) != null) {
    return
  }
  // Defaults before the container, every time — the same rule the head snippet exists to keep.
  consentStore.init(opts)

  const inject = (): void => {
    if (document.getElementById(marker) != null) {
      return
    }
    const layer = opts.dataLayerName ?? 'dataLayer'
    const script = document.createElement('script')
    script.id = marker
    script.async = true
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(opts.id)}`
      + (layer !== 'dataLayer' ? `&l=${encodeURIComponent(layer)}` : '')
    document.head.appendChild(script)
  }

  if ((opts.mode ?? GOOGLE_TAG_DEFAULT_MODE) !== 'basic') {
    inject()

    return
  }

  if (trackingGranted(consentStore.get().record, opts.categories)) {
    inject()

    return
  }

  const unsubscribe = consentStore.subscribe(state => {
    if (trackingGranted(state.record, opts.categories)) {
      unsubscribe()
      inject()
    }
  })
}

/**
 * Which loader an id takes: `gtm` is the Tag Manager container (`gtm.js`), `gtag` the Google tag
 * (`gtag.js`) — Google Analytics 4 (`G-`), a Google tag (`GT-`), Google Ads (`AW-`) and
 * Floodlight (`DC-`).
 */
export type GoogleTagKind = 'gtm' | 'gtag'

/**
 * The id shapes Google issues today, and nothing else.
 *
 * Deliberately strict — upper case, a known prefix, a bounded run of letters and digits — because
 * the id is typed by a person into a settings form and ends up inside an inline script and a
 * script URL. A value this pattern accepts cannot carry a quote, a tag or a second parameter, so
 * the check is what makes it safe to store, not only to emit. `UA-` is not here: Universal
 * Analytics stopped processing data in 2024, and accepting its ids would promise measurement that
 * never arrives.
 */
const GOOGLE_TAG_ID = /^(GTM-[A-Z0-9]{4,12}|(G|GT|AW|DC)-[A-Z0-9]{4,16})$/

/** Whether `id` is a Tag Manager container or Google tag id this package can load. */
export const isGoogleTagId = (id: string): boolean =>
  typeof id === 'string' && GOOGLE_TAG_ID.test(id)

/** The loader `id` takes, or `null` when it is not a loadable id at all. */
export const googleTagKind = (id: string): GoogleTagKind | null =>
  !isGoogleTagId(id) ? null : id.startsWith('GTM-') ? 'gtm' : 'gtag'

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

/** A queue name has to be a plain identifier: it becomes `window[name]` in the emitted script. */
const JS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

const layerOf = (opts: GoogleTagOptions): string =>
  opts.dataLayerName != null && JS_IDENTIFIER.test(opts.dataLayerName)
    ? opts.dataLayerName
    : 'dataLayer'

/**
 * Make a generated script safe to place between `<script>` and `</script>`.
 *
 * JSON encoding keeps a value inside its string literal, but the HTML parser does not read
 * JavaScript: it ends the element at the first `</script` it meets, wherever it sits, and a
 * `<!--` can switch it into a state where the real closing tag is swallowed. Both sequences can
 * only appear inside the JSON-encoded values here — category keys, a storage key, a queue name —
 * so each gets a backslash that JavaScript reads as nothing (`\/` is `/`, `\!` is `!`).
 */
const inlineSafe = (script: string): string =>
  script.replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--')

/**
 * Ads data redaction on, URL passthrough off — before any loader runs.
 *
 * `ads_data_redaction` makes an Ads or Floodlight tag strip ad-click identifiers and send its
 * requests through a cookieless domain while `ad_storage` is denied. `url_passthrough` is set to
 * its default explicitly so that nothing configured later on the page can switch on decorating
 * links with click ids for a visitor who refused marketing storage. Google reads both only when
 * they are set ahead of the tag's `config`.
 */
const redactionScript = (layer: string): string =>
  `(function(w,l){w[l]=w[l]||[];function g(){w[l].push(arguments)}` +
  `g('set','ads_data_redaction',true);g('set','url_passthrough',false)})` +
  `(window,${JSON.stringify(layer)})`

/**
 * Google's gtag.js snippet as one inline script: the queue function, `js` and `config`, then the
 * library requested from here rather than from a second `<script src>` element.
 *
 * One inline script instead of Google's two elements because the document it lands in is served
 * with a hash-based CSP and stamped by a build that writes one head snippet — a second element
 * would be a second thing to keep in order. The element carries an id derived from the tag, so a
 * page that runs the snippet twice (two stampings, a hot reload) does not configure the tag twice
 * and double-count every page view. `window.gtag` is published only when nothing else owns it, so
 * application code can send its own events.
 */
const gtagScript = (layer: string, id: string): string =>
  `(function(w,d,l,i){var m='owl-gtag-'+i;if(d.getElementById(m))return;` +
  `w[l]=w[l]||[];function g(){w[l].push(arguments)}if(!w.gtag)w.gtag=g;` +
  `g('js',new Date());g('config',i);` +
  `var j=d.createElement('script');j.id=m;j.async=true;` +
  `j.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(i)` +
  `+(l!='dataLayer'?'&l='+encodeURIComponent(l):'');` +
  `(d.head||d.documentElement).appendChild(j)})` +
  `(window,document,${JSON.stringify(layer)},${JSON.stringify(id)})`

/**
 * The one inline `<head>` script for a Google tag of any kind: the consent bootstrap FIRST, then
 * ads redaction, then the loader the id's prefix calls for — the Tag Manager container for `GTM-`,
 * gtag.js with `js` and `config` for `G-`, `GT-`, `AW-` and `DC-`.
 *
 * The order is the rule {@link gtmHeadScript} exists for, and it holds for gtag.js just the same:
 * a tag decides what it may do from the consent state present when it loads. The bootstrap
 * declares everything denied and applies any stored decision in the same turn, so a returning
 * visitor's tag starts granted and a new visitor's starts cookieless.
 *
 * An id that is not a loadable id ({@link isGoogleTagId}) yields the consent bootstrap alone — a
 * page must never lose its consent defaults because someone mistyped a tag. The result is safe to
 * place inline in HTML as-is: `</` and `<!--` inside any configured value are escaped.
 *
 * In `GOOGLE_TAG_DEFAULT_MODE` (`'basic'`) the loader itself — the last piece — is wrapped in
 * `consentGateScript`: it runs immediately for a returning visitor whose stored record already
 * grants a signal-bearing category, and otherwise waits for `@owlmeans/consent`'s `CONSENT_EVENT`
 * before ever requesting the tag. The bootstrap and the redaction flags are unaffected and still
 * run unconditionally — Consent Mode's OWN denied-by-default signals are declared either way, so a
 * tag that later does load still starts from `ad_storage`/`analytics_storage` denied. Pass
 * `mode: 'advanced'` for the original, unconditional load.
 */
export const googleTagHeadScript = (opts: GoogleTagOptions): string => {
  const bootstrap = consentBootstrapScript(opts)
  const kind = googleTagKind(opts.id)
  if (kind == null) {
    return inlineSafe(bootstrap)
  }
  const layer = layerOf(opts)
  const loader = kind === 'gtm' ? gtmContainerScript(layer, opts.id) : gtagScript(layer, opts.id)
  const redaction = redactionScript(layer)

  if ((opts.mode ?? GOOGLE_TAG_DEFAULT_MODE) === 'basic') {
    return inlineSafe(`${bootstrap};${redaction};${consentGateScript(loader, opts)}`)
  }

  return inlineSafe(`${bootstrap};${redaction};${loader}`)
}

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

const GOOGLE = 'Google LLC'
const GOOGLE_PRIVACY = 'https://policies.google.com/privacy'

const analyticsService = (name: string, purpose: string, cookies: string[]): ConsentService => ({
  name, provider: GOOGLE, category: CONSENT_ANALYTICS, purpose, cookies, privacyHref: GOOGLE_PRIVACY,
})

const adsService = (name: string, purpose: string, cookies: string[]): ConsentService => ({
  name, provider: GOOGLE, category: CONSENT_MARKETING, purpose, cookies, privacyHref: GOOGLE_PRIVACY,
})

const UNTIL_ANALYTICS = 'Until analytics cookies are accepted it sets no cookies and sends only '
  + 'cookieless measurement signals.'
const UNTIL_MARKETING = 'Until marketing cookies are accepted it sets no cookies and ad click '
  + 'identifiers are redacted.'

/**
 * What a Google tag discloses on the cookie policy, for `CookiePolicy`'s `services`.
 *
 * Read off the id's prefix, because that is all the page knows: `G-` is Google Analytics 4
 * (`_ga`, and `_ga_<id without G->` which carries the session), `AW-` Google Ads, `DC-` Floodlight.
 * A `GTM-` container and a `GT-` Google tag route to whatever their owner configured at Google,
 * so both are disclosed as an analytics AND an advertising entry, worded as configured there —
 * the policy may not claim less than the tag can do. An invalid id discloses nothing, matching
 * {@link googleTagHeadScript}, which loads nothing for it.
 */
export const googleTagServices = (id: string): ConsentService[] => {
  if (!isGoogleTagId(id)) {
    return []
  }
  const prefix = id.slice(0, id.indexOf('-'))
  switch (prefix) {
    case 'G':
      return [analyticsService(
        'Google Analytics',
        'Measures how visitors use the site — pages viewed, time spent, device and approximate '
          + `location — so it can be improved. ${UNTIL_ANALYTICS}`,
        ['_ga', `_ga_${id.slice(2)}`],
      )]
    case 'AW':
      return [adsService(
        'Google Ads',
        'Measures which ads led to a visit or a sign-up, and may add visitors to audiences for '
          + `showing them ads elsewhere. ${UNTIL_MARKETING}`,
        ['_gcl_au', '_gcl_aw'],
      )]
    case 'DC':
      return [adsService(
        'Google Campaign Manager 360 (Floodlight)',
        `Measures which ad campaigns led to a visit or a sign-up. ${UNTIL_MARKETING}`,
        ['_gcl_au', '_gcl_dc'],
      )]
    default: {
      const source = prefix === 'GTM' ? 'Google Tag Manager' : 'Google tag'
      const where = prefix === 'GTM' ? 'in its container' : 'for it at Google'

      return [
        analyticsService(
          `${source} — analytics`,
          `Runs the analytics tags configured ${where}, typically Google Analytics. `
            + UNTIL_ANALYTICS,
          ['_ga', '_ga_*'],
        ),
        adsService(
          `${source} — advertising`,
          `Runs the advertising tags configured ${where}, typically Google Ads conversion `
            + `tracking and remarketing. ${UNTIL_MARKETING}`,
          ['_gcl_au', '_gcl_aw'],
        ),
      ]
    }
  }
}
