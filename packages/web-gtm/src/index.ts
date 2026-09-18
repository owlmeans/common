import { consentBootstrapScript, consentStore } from '@owlmeans/consent'
import type { ConsentOptions } from '@owlmeans/consent'

export interface GtmOptions extends ConsentOptions {
  /** Container id, e.g. `GTM-XXXXXXX`. */
  id: string
  /** The queue name, when a page runs more than one container. */
  dataLayerName?: string
}

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
 */
export const gtmHeadScript = (opts: GtmOptions): string => {
  const layer = opts.dataLayerName ?? 'dataLayer'

  return `${consentBootstrapScript(opts)};` +
    `(function(w,d,s,l,i){w[l]=w[l]||[];` +
    `w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
    `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),` +
    `dl=l!='dataLayer'?'&l='+l:'';j.async=true;` +
    `j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;` +
    `f.parentNode.insertBefore(j,f)})` +
    `(window,document,'script',${JSON.stringify(layer)},${JSON.stringify(opts.id)})`
}

/** The `<noscript>` iframe, for the body. */
export const gtmNoscriptFrame = (opts: GtmOptions): string =>
  `<iframe src="https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(opts.id)}"` +
  ` height="0" width="0" style="display:none;visibility:hidden"></iframe>`

/**
 * Load the container from script, for a host that cannot emit into its own head.
 *
 * The head snippet is strictly better and should be preferred; this exists for a single-page app
 * whose HTML is not ours to edit. It still pushes the defaults first, and it still refuses to load
 * a second time.
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

  const layer = opts.dataLayerName ?? 'dataLayer'
  const script = document.createElement('script')
  script.id = marker
  script.async = true
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(opts.id)}`
    + (layer !== 'dataLayer' ? `&l=${encodeURIComponent(layer)}` : '')
  document.head.appendChild(script)
}
