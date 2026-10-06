import type { ConsentLinkPayload, ConsentOptions, ConsentPlugin, ConsentRecord } from '../types.js'

/** Cross-domain consent: the decorated-link parameter, the linker plugin and its inline twin. */
export interface ConsentLinkHelper {
  /**
   * The link parameter's value: the current document's decision as `c` (one `0`/`1` per optional
   * category — empty while `record` is `null`, i.e. before the visitor has decided) and, when
   * `opts.linker.language` is set, the page's language as `l`.
   */
  encodeConsentLink: (record: ConsentRecord | null, opts?: ConsentOptions) => string
  /** Parse-only — no trust decision here, that is `consentLinker(opts).adopt`'s job. Never throws. */
  decodeConsentLink: (value: string) => ConsentLinkPayload | null
  /**
   * Persist an adopted language where the application's i18n layer reads its explicit choice from —
   * `linker.language.storageKey`, `owlmeans-lng` by default. Unconditional: the interface language is
   * strictly necessary storage (the visitor picked it, and the site cannot speak to them without it),
   * so no cookie decision — none yet, a refusal, an old record — stands between it and the device.
   *
   * It overwrites what is there on purpose: the carried language is the one the visitor was reading a
   * moment ago, which outranks a choice they made on this domain some other day. Storage that refuses
   * the write is not an error. Returns whether the language was written.
   */
  writeConsentLanguage: (language: string, opts?: ConsentOptions) => boolean
  /**
   * Cross-domain consent: share this decision, and adopt one, between the domains named in
   * `opts.linker.domains`.
   *
   * `start` decorates outgoing first-party links; `adopt` reads and validates an incoming one;
   * `domains` discloses the list a dialog or policy page names. `decorate` is generic (a bare `URL`,
   * no DOM) so the same trust rule serves a real anchor click and a programmatic navigation
   * (`decorateConsentUrl`) alike — the `rel="noreferrer"` exemption is a DOM-only concept and is
   * therefore checked by `start`'s click handler, never here.
   */
  consentLinker: () => ConsentPlugin
  /**
   * Remove the link parameter from the visible URL, keeping every other parameter and the hash — the
   * real-TS equivalent of what {@link consentLinkerScript}'s embedded fragment already did inline.
   * Idempotent: a page with no head script calls this from `consentStore.init` and it strips once; a
   * page that ALSO carried the head script finds the parameter already gone and does nothing.
   */
  stripConsentLinkParam: (opts: ConsentOptions) => void
  /**
   * The inline `<head>` fragment that adopts a decorated link's decision and strips the parameter —
   * standalone, so a page can stamp it even where nothing else here runs (a legal page with no tag
   * script). `@owlmeans/web-gtm`'s `consentBootstrapScript` embeds this SAME fragment right after
   * pushing Consent Mode's defaults, so a page that has both never runs it twice with different
   * effect — the second attempt finds the parameter already gone and does nothing.
   *
   * Mirrors `consentLinker().adopt` exactly (v2, referrer + freshness/skew + full optional coverage +
   * no existing record), but as hand-rolled JS text rather than a call into this module — the same
   * discipline `consentBootstrapScript`/`consentGateScript` already follow, because this has to run
   * before any bundle (this module included) has loaded. The parameter is ALWAYS stripped via
   * `history.replaceState`, whether or not the trust rule accepts it: a stale or foreign `owlcc` is
   * exactly as much noise as an adopted one, and neither belongs in the visible URL or in what a page
   * reload, a shared link or a browser history entry carries forward.
   */
  consentLinkerScript: (opts: ConsentOptions) => string
}
