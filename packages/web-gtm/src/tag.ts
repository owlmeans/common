import { CONSENT_ANALYTICS, CONSENT_MARKETING, consentModeHelper, consentStore, type ConsentService } from '@owlmeans/consent'
import { GOOGLE, GOOGLE_PRIVACY, GOOGLE_TAG_ID, JS_IDENTIFIER, UNTIL_ANALYTICS, UNTIL_MARKETING } from './consts.local.js'
import { GOOGLE_TAG_DEFAULT_MODE } from './consts.js'
import type { GoogleTagKind, GoogleTagOptions, GtmOptions } from './types.js'
import type { GoogleTagHelper } from './tag/types.js'

export const createGoogleTagHelper = (): GoogleTagHelper => {
  /** Google's own container IIFE, the id and queue name injected as JSON data. */
  const gtmContainerScript = (layer: string, id: string): string =>
    `(function(w,d,s,l,i){w[l]=w[l]||[];` +
    `w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
    `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),` +
    `dl=l!='dataLayer'?'&l='+l:'';j.async=true;` +
    `j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;` +
    `f.parentNode.insertBefore(j,f)})` +
    `(window,document,'script',${JSON.stringify(layer)},${JSON.stringify(id)})`

  const gtmHeadScript = (opts: GtmOptions): string => {
    const bootstrap = consentModeHelper.consentBootstrapScript(opts)
    const loader = gtmContainerScript(opts.dataLayerName ?? 'dataLayer', opts.id)

    if ((opts.mode ?? GOOGLE_TAG_DEFAULT_MODE) === 'basic') {
      return `${bootstrap};${consentModeHelper.consentGateScript(loader, opts)}`
    }

    return `${bootstrap};${loader}`
  }

  const gtmNoscriptFrame = (opts: GtmOptions): string => {
    if ((opts.mode ?? GOOGLE_TAG_DEFAULT_MODE) === 'basic') {
      return ''
    }

    return `<iframe src="https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(opts.id)}"` +
      ` height="0" width="0" style="display:none;visibility:hidden"></iframe>`
  }

  const loadGtm = (opts: GtmOptions): void => {
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

    if (consentModeHelper.trackingGranted(consentStore.get().record, opts.categories)) {
      inject()

      return
    }

    const unsubscribe = consentStore.subscribe(state => {
      if (consentModeHelper.trackingGranted(state.record, opts.categories)) {
        unsubscribe()
        inject()
      }
    })
  }

  const isGoogleTagId = (id: string): boolean =>
    typeof id === 'string' && GOOGLE_TAG_ID.test(id)

  const googleTagKind = (id: string): GoogleTagKind | null =>
    !isGoogleTagId(id) ? null : id.startsWith('GTM-') ? 'gtm' : 'gtag'

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

  const googleTagHeadScript = (opts: GoogleTagOptions): string => {
    const bootstrap = consentModeHelper.consentBootstrapScript(opts)
    const kind = googleTagKind(opts.id)
    if (kind == null) {
      return inlineSafe(bootstrap)
    }
    const layer = layerOf(opts)
    const loader = kind === 'gtm' ? gtmContainerScript(layer, opts.id) : gtagScript(layer, opts.id)
    const redaction = redactionScript(layer)

    if ((opts.mode ?? GOOGLE_TAG_DEFAULT_MODE) === 'basic') {
      return inlineSafe(`${bootstrap};${redaction};${consentModeHelper.consentGateScript(loader, opts)}`)
    }

    return inlineSafe(`${bootstrap};${redaction};${loader}`)
  }

  const analyticsService = (name: string, purpose: string, cookies: string[]): ConsentService => ({
    name, provider: GOOGLE, category: CONSENT_ANALYTICS, purpose, cookies, privacyHref: GOOGLE_PRIVACY,
  })

  const adsService = (name: string, purpose: string, cookies: string[]): ConsentService => ({
    name, provider: GOOGLE, category: CONSENT_MARKETING, purpose, cookies, privacyHref: GOOGLE_PRIVACY,
  })

  const googleTagServices = (id: string): ConsentService[] => {
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

  return {
    gtmHeadScript, gtmNoscriptFrame, loadGtm, isGoogleTagId, googleTagKind, googleTagHeadScript, googleTagServices,
  }
}

export const googleTagHelper = createGoogleTagHelper()

/** @deprecated compat:factory-refactor — use `googleTagHelper.gtmHeadScript(…)` */
export const gtmHeadScript = (opts: GtmOptions): string => googleTagHelper.gtmHeadScript(opts)

/** @deprecated compat:factory-refactor — use `googleTagHelper.gtmNoscriptFrame(…)` */
export const gtmNoscriptFrame = (opts: GtmOptions): string => googleTagHelper.gtmNoscriptFrame(opts)

/** @deprecated compat:factory-refactor — use `googleTagHelper.isGoogleTagId(…)` */
export const isGoogleTagId = (id: string): boolean => googleTagHelper.isGoogleTagId(id)

/** @deprecated compat:factory-refactor — use `googleTagHelper.googleTagHeadScript(…)` */
export const googleTagHeadScript = (opts: GoogleTagOptions): string => googleTagHelper.googleTagHeadScript(opts)

/** @deprecated compat:factory-refactor — use `googleTagHelper.googleTagServices(…)` */
export const googleTagServices = (id: string): ConsentService[] => googleTagHelper.googleTagServices(id)
