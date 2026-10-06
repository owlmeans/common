import type { ConsentService } from '@owlmeans/consent'
import type { GoogleTagKind, GoogleTagOptions, GtmOptions } from '../types.js'

/** A Google tag behind consent: its inline head script, its fallbacks, its id rules, its disclosure. */
export interface GoogleTagHelper {
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
  gtmHeadScript: (opts: GtmOptions) => string
  /**
   * The `<noscript>` iframe, for the body.
   *
   * In `'basic'` mode this is an empty string: the whole point of gating is that an unauthenticated
   * `<noscript>` iframe would defeat it — a browser with JavaScript disabled cannot have granted
   * anything, so there is nothing lawful left to render. `'advanced'` keeps the frame.
   */
  gtmNoscriptFrame: (opts: GtmOptions) => string
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
  loadGtm: (opts: GtmOptions) => void
  /** Whether `id` is a Tag Manager container or Google tag id this package can load. */
  isGoogleTagId: (id: string) => boolean
  /** The loader `id` takes, or `null` when it is not a loadable id at all. */
  googleTagKind: (id: string) => GoogleTagKind | null
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
  googleTagHeadScript: (opts: GoogleTagOptions) => string
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
  googleTagServices: (id: string) => ConsentService[]
}
