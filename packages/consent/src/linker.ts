import {
  CONSENT_COOKIE_DAYS, CONSENT_FUNCTIONAL, CONSENT_KEY, CONSENT_LANGUAGE_KEY, CONSENT_PENDING_LANGUAGE,
  CONSENT_SCHEMA_VERSION, DEFAULT_CONSENT_CATEGORIES,
} from './consts.js'
import { functionalGranted } from './functional.js'
import type { ConsentPlugin } from './plugins.js'
import { decorateConsentUrl } from './plugins.js'
import { readConsent } from './storage.js'
import type { ConsentCategory, ConsentOptions, ConsentRecord } from './types.js'

/** The URL parameter a decorated link carries the decision in, absent an override. */
export const CONSENT_LINK_PARAM = 'owlcc'
/** How old a decorated link's timestamp may be and still be trusted, in seconds, absent an override. */
export const CONSENT_LINK_MAX_AGE = 300
/** Clock skew allowed the OTHER way — a timestamp up to this far in the future is still trusted. */
export const CONSENT_LINK_SKEW = 60

const CONSENT_LINK_VERSION = 2

/** The decoded, not-yet-validated payload a decorated link's parameter carries. */
export interface ConsentLinkPayload {
  v: typeof CONSENT_LINK_VERSION
  /** One entry per OPTIONAL category this site knows, `1` granted / `0` denied. */
  c: Record<string, 0 | 1>
  /** Unix seconds the link was decorated at. */
  t: number
  /**
   * The interface language of the page the link was on (a BCP 47 tag, lower-cased) — present only
   * when the sender has `linker.language` set and its `<html lang>` names one. Optional on the
   * wire, so a receiver that predates it reads the same `v: 2` payload and ignores the field.
   */
  l?: string
}

/** A BCP 47-shaped tag: a 2–3 letter language and up to three subtags (`pl`, `pt-BR`, `zh-Hant-TW`). */
const LANGUAGE_TAG = /^[a-z]{2,3}(?:[-_][a-z0-9]{1,8}){0,3}$/i

const categoriesOf = (opts?: ConsentOptions): ConsentCategory[] =>
  opts?.categories ?? DEFAULT_CONSENT_CATEGORIES

const optionalOf = (opts?: ConsentOptions): ConsentCategory[] =>
  categoriesOf(opts).filter(category => category.required !== true)

const toBase64Url = (json: string): string =>
  btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64Url = (value: string): string | null => {
  try {
    let padded = value.replace(/-/g, '+').replace(/_/g, '/')
    while (padded.length % 4 !== 0) {
      padded += '='
    }

    return atob(padded)
  } catch {
    return null
  }
}

/** The language this document is written in — `<html lang>`, the one signal every page has. */
const documentLanguage = (): string | null => {
  if (typeof document === 'undefined') {
    return null
  }
  const lang = document.documentElement?.lang?.trim() ?? ''

  return LANGUAGE_TAG.test(lang) ? lang.toLowerCase() : null
}

/**
 * The link parameter's value: the current document's decision as `c` (one `0`/`1` per optional
 * category — empty while `record` is `null`, i.e. before the visitor has decided) and, when
 * `opts.linker.language` is set, the page's language as `l`.
 */
export const encodeConsentLink = (record: ConsentRecord | null, opts?: ConsentOptions): string => {
  const c: Record<string, 0 | 1> = {}
  if (record != null) {
    for (const category of optionalOf(opts)) {
      c[category.key] = record[category.key] === true ? 1 : 0
    }
  }
  const language = opts?.linker?.language != null ? documentLanguage() : null
  const payload: ConsentLinkPayload = {
    v: CONSENT_LINK_VERSION, c, t: Math.floor(Date.now() / 1000), ...(language != null ? { l: language } : {}),
  }

  return toBase64Url(JSON.stringify(payload))
}

/** Parse-only — no trust decision here, that is `consentLinker(opts).adopt`'s job. Never throws. */
export const decodeConsentLink = (value: string): ConsentLinkPayload | null => {
  const json = fromBase64Url(value)
  if (json == null) {
    return null
  }
  try {
    const parsed = JSON.parse(json) as unknown
    if (parsed == null || typeof parsed !== 'object') {
      return null
    }
    const { v, c, t, l } = parsed as Record<string, unknown>
    if (v !== CONSENT_LINK_VERSION || typeof t !== 'number' || c == null || typeof c !== 'object') {
      return null
    }

    return {
      v: CONSENT_LINK_VERSION, c: c as Record<string, 0 | 1>, t,
      // A malformed language is dropped, never a reason to refuse the decision beside it.
      ...(typeof l === 'string' && LANGUAGE_TAG.test(l) ? { l: l.toLowerCase() } : {}),
    }
  } catch {
    return null
  }
}

const referrerHostname = (): string | null => {
  if (typeof document === 'undefined' || document.referrer === '') {
    return null
  }
  try {
    return new URL(document.referrer).hostname
  } catch {
    return null
  }
}

/**
 * The payload of the link this document was opened from, once it has passed every check that does
 * not depend on WHAT it carries: the parameter decodes and its version matches, its timestamp is
 * fresh (and not from the future beyond the allowed skew), and the request's referrer host is a
 * LISTED domain — read from `document.referrer`, never from the parameter itself. `null` otherwise.
 */
const trustedPayload = (opts: ConsentOptions): ConsentLinkPayload | null => {
  const linker = opts.linker
  if (linker == null || typeof location === 'undefined') {
    return null
  }
  const raw = new URLSearchParams(location.search).get(linker.param ?? CONSENT_LINK_PARAM)
  if (raw == null) {
    return null
  }
  const decoded = decodeConsentLink(raw)
  if (decoded == null) {
    return null
  }
  const now = Math.floor(Date.now() / 1000)
  const maxAge = linker.maxAge ?? CONSENT_LINK_MAX_AGE
  if (now - decoded.t > maxAge || decoded.t - now > CONSENT_LINK_SKEW) {
    return null
  }
  const referrer = referrerHostname()
  if (referrer == null || !linker.domains.includes(referrer)) {
    return null
  }

  return decoded
}

/** The entry of `supported` that `language` names — exactly, else by its base tag — or `null`. */
const supportedLanguage = (language: string, supported: string[]): string | null => {
  const wanted = language.toLowerCase()
  const exact = supported.find(candidate => candidate.toLowerCase() === wanted)
  if (exact != null) {
    return exact
  }
  const base = wanted.split(/[-_]/)[0]

  return supported.find(candidate => candidate.toLowerCase() === base) ?? null
}

/**
 * Persist an adopted language where the application's i18n layer reads its explicit choice from —
 * `linker.language.storageKey`, `owlmeans-lng` by default — and only while the visitor has GRANTED
 * `functional` on this document (a stored record, or the one adopted from the very link that
 * carried the language). Without that grant nothing is written and `false` comes back: remembering
 * a preference on a visitor's device is storage like any other, and a refusal ("reject all") is an
 * answer, not a gap to fill. The gate lives here, not in the callers, so no caller can forget it.
 *
 * It overwrites what is there on purpose: the carried language is the one the visitor was reading a
 * moment ago, which outranks a choice they made on this domain some other day. Storage that refuses
 * the write is not an error. Returns whether the language was written.
 */
export const writeConsentLanguage = (language: string, opts?: ConsentOptions): boolean => {
  if (!functionalGranted(opts)) {
    return false
  }
  try {
    localStorage.setItem(opts?.linker?.language?.storageKey ?? CONSENT_LANGUAGE_KEY, language)

    return true
  } catch {
    // Private modes and blocked storage both throw; the app simply keeps choosing its own language.
    return false
  }
}

/** Escape `<` inside a JSON literal meant for an inline `<script>` — the same discipline every
 * caller of `consentBootstrapScript`/`consentGateScript` already owes the HTML it lands in, applied
 * here at the source since this fragment's dynamic values (a configured domain, a storage key) are
 * least likely to have been reviewed for it by whoever composes the final page. */
const jsonForScript = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')

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
export const consentLinker = (): ConsentPlugin => {
  let installed = false

  return {
    alias: 'linker',

    start: opts => {
      if (typeof document === 'undefined' || installed || opts.linker == null) {
        return
      }
      installed = true

      const onNavigate = (event: Event): void => {
        const target = event.target
        const anchor = target instanceof Element ? target.closest('a[href]') : null
        if (!(anchor instanceof HTMLAnchorElement)) {
          return
        }
        // The trust rule keeps `noreferrer` links untouched: a link that refuses to disclose the
        // referrer is refusing exactly the signal the receiving side's `adopt` needs to trust it.
        if (/\bnoreferrer\b/.test(anchor.getAttribute('rel') ?? '')) {
          return
        }
        // No decision yet is still worth a decoration when a language rides along with it.
        const record = readConsent(opts)
        if (record == null && opts.linker?.language == null) {
          return
        }
        let url: URL
        try {
          url = new URL(anchor.href, location.href)
        } catch {
          return
        }
        const decorated = decorateConsentUrl(url, record, opts)
        if (decorated.toString() !== url.toString()) {
          anchor.href = decorated.toString()
        }
      }

      // Capture phase: this must decide before the click's own navigation (or a framework router
      // intercepting it) reads `href`. `auxclick`/`contextmenu` cover a middle-click and "copy link
      // address" — an address copied undecorated is a link that silently fails to carry the choice.
      document.addEventListener('click', onNavigate, true)
      document.addEventListener('auxclick', onNavigate, true)
      document.addEventListener('contextmenu', onNavigate, true)
    },

    decorate: (url, record, opts) => {
      const linker = opts.linker
      const host = typeof location !== 'undefined' ? location.hostname : ''
      if (linker == null || url.hostname === host || !linker.domains.includes(url.hostname)) {
        return null
      }
      // A link carries a decision, a language, or both; with neither there is nothing to say.
      if (record == null && (linker.language == null || documentLanguage() == null)) {
        return null
      }
      const next = new URL(url.toString())
      next.searchParams.set(linker.param ?? CONSENT_LINK_PARAM, encodeConsentLink(record, opts))

      return next
    },

    adopt: opts => {
      const decoded = trustedPayload(opts)
      if (decoded == null) {
        return null
      }
      const optional = optionalOf(opts)
      if (!optional.every(category => decoded.c[category.key] === 0 || decoded.c[category.key] === 1)) {
        return null
      }

      const record: ConsentRecord = { v: CONSENT_SCHEMA_VERSION }
      for (const category of categoriesOf(opts)) {
        record[category.key] = category.required === true || decoded.c[category.key] === 1
      }

      return record
    },

    adoptLanguage: opts => {
      const supported = opts.linker?.language?.supported
      const decoded = supported != null ? trustedPayload(opts) : null

      return decoded?.l != null && supported != null ? supportedLanguage(decoded.l, supported) : null
    },

    domains: opts => opts.linker?.domains ?? [],
  }
}

/**
 * Remove the link parameter from the visible URL, keeping every other parameter and the hash — the
 * real-TS equivalent of what {@link consentLinkerScript}'s embedded fragment already did inline.
 * Idempotent: a page with no head script calls this from `consentStore.init` and it strips once; a
 * page that ALSO carried the head script finds the parameter already gone and does nothing.
 */
export const stripConsentLinkParam = (opts: ConsentOptions): void => {
  const linker = opts.linker
  if (linker == null || typeof location === 'undefined' || typeof history === 'undefined') {
    return
  }
  const param = linker.param ?? CONSENT_LINK_PARAM
  const url = new URL(location.href)
  if (!url.searchParams.has(param)) {
    return
  }
  url.searchParams.delete(param)
  try {
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    // A sandboxed/embedded context may refuse history writes; the parameter just stays visible.
  }
}

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
export const consentLinkerScript = (opts: ConsentOptions): string => {
  const linker = opts.linker
  if (linker == null) {
    return ''
  }
  const param = jsonForScript(linker.param ?? CONSENT_LINK_PARAM)
  const domains = jsonForScript(linker.domains)
  const storageKey = jsonForScript(opts.storageKey ?? CONSENT_KEY)
  const optionalKeys = jsonForScript(optionalOf(opts).map(category => category.key))
  const allCategories = jsonForScript(
    categoriesOf(opts).map(category => ({ key: category.key, required: category.required === true }))
  )
  const maxAge = linker.maxAge ?? CONSENT_LINK_MAX_AGE
  const skew = CONSENT_LINK_SKEW
  const cookieDays = opts.cookieDays ?? CONSENT_COOKIE_DAYS
  const version = CONSENT_LINK_VERSION
  // The language rides the same trust decision but is WRITTEN only while `functional` is granted
  // here — in the stored record, or in the record just adopted from this very link (`fg` below).
  // Otherwise it is left on `window` for the store to pick up (memory, never storage): the visitor
  // may still grant functional storage later in this page's life. Mirrors `supportedLanguage` +
  // `writeConsentLanguage`; empty for a page that does not receive a language.
  const functionalKey = jsonForScript(CONSENT_FUNCTIONAL)
  const language = linker.language?.supported != null
    ? `var L=${jsonForScript(linker.language.supported)};` +
      `if(typeof j.l==='string'){var lc=j.l.toLowerCase(),lm=null,q;` +
      `for(q=0;q<L.length;q++){if(String(L[q]).toLowerCase()===lc){lm=L[q];break}}` +
      `if(!lm){lc=lc.split(/[-_]/)[0];for(q=0;q<L.length;q++){if(String(L[q]).toLowerCase()===lc){lm=L[q];break}}}` +
      `if(lm){if(fg){try{w.localStorage.setItem(${jsonForScript(linker.language.storageKey ?? CONSENT_LANGUAGE_KEY)},lm)}catch(e){}}` +
      `else{w[${jsonForScript(CONSENT_PENDING_LANGUAGE)}]=lm}}}`
    : ''

  return `(function(w,d){` +
    `var p=${param};var qs;try{qs=new URLSearchParams(location.search)}catch(e){return}` +
    `var raw=qs.get(p);if(raw==null)return;` +
    `qs.delete(p);var rest=qs.toString();` +
    `var url=location.pathname+(rest?('?'+rest):'')+location.hash;` +
    `try{history.replaceState(history.state,'',url)}catch(e){}` +
    `try{` +
      `var b=raw.replace(/-/g,'+').replace(/_/g,'/');while(b.length%4)b+='=';` +
      `var j=JSON.parse(atob(b));` +
      `if(!j||j.v!==${version}||typeof j.t!=='number'||!j.c||typeof j.c!=='object')return;` +
      `var now=Math.floor(Date.now()/1000);` +
      `if(now-j.t>${maxAge}||j.t-now>${skew})return;` +
      `var ref=null;try{ref=new URL(d.referrer).hostname}catch(e){}` +
      `if(!ref||${domains}.indexOf(ref)<0)return;` +
      `var existing=null;try{existing=w.localStorage.getItem(${storageKey})}catch(e){}` +
      `if(!existing){var cp=('; '+d.cookie).split('; '+${storageKey}+'=');` +
        `if(cp.length===2)existing=cp.pop().split(';').shift()}` +
      // `fg`: functional storage is granted here — by a parseable stored record, or by the one
      // adopted below. A record with no `functional` key (saved before the category existed) is not
      // a grant.
      `var fg=false;` +
      `if(existing){try{var ex=JSON.parse(existing);fg=!!ex&&typeof ex==='object'&&ex[${functionalKey}]===true}catch(e){}}` +
      `else{` +
        `var keys=${optionalKeys},ok=true;` +
        `for(var i=0;i<keys.length;i++){if(j.c[keys[i]]!==0&&j.c[keys[i]]!==1){ok=false;break}}` +
        `if(ok){` +
          `var cats=${allCategories},rec={v:${version}};` +
          `for(var k=0;k<cats.length;k++){var c=cats[k];rec[c.key]=c.required||j.c[c.key]===1}` +
          `var val=JSON.stringify(rec);` +
          `try{w.localStorage.setItem(${storageKey},val)}catch(e){}` +
          `var exp=new Date(Date.now()+${cookieDays}*86400000).toUTCString();` +
          `d.cookie=${storageKey}+'='+val+';expires='+exp+';path=/;SameSite=Lax';fg=rec[${functionalKey}]===true` +
        `}` +
      `}` +
      language +
    `}catch(e){}` +
  `})(window,document)`
}
