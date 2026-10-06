import { CONSENT_COOKIE_DAYS, CONSENT_KEY, CONSENT_LANGUAGE_KEY, CONSENT_SCHEMA_VERSION, DEFAULT_CONSENT_CATEGORIES, CONSENT_LINK_MAX_AGE, CONSENT_LINK_PARAM, CONSENT_LINK_SKEW } from './consts.js'
import type { ConsentPlugin, ConsentCategory, ConsentOptions, ConsentRecord, ConsentLinkPayload } from './types.js'
import { consentPluginHelper } from './plugins.js'
import { consentStorageHelper } from './storage.js'
import { CONSENT_LINK_VERSION, LANGUAGE_TAG } from './consts.local.js'
import type { ConsentLinkHelper } from './linker/types.js'

export const createConsentLinkHelper = (): ConsentLinkHelper => {
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

  const encodeConsentLink = (record: ConsentRecord | null, opts?: ConsentOptions): string => {
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

  const decodeConsentLink = (value: string): ConsentLinkPayload | null => {
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

  const writeConsentLanguage = (language: string, opts?: ConsentOptions): boolean => {
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

  const consentLinker = (): ConsentPlugin => {
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
          const record = consentStorageHelper.readConsent(opts)
          if (record == null && opts.linker?.language == null) {
            return
          }
          let url: URL
          try {
            url = new URL(anchor.href, location.href)
          } catch {
            return
          }
          const decorated = consentPluginHelper.decorateConsentUrl(url, record, opts)
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

  const stripConsentLinkParam = (opts: ConsentOptions): void => {
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

  const consentLinkerScript = (opts: ConsentOptions): string => {
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
    // The language rides the same trust decision and is written unconditionally — it is strictly
    // necessary storage, whatever the cookie decision is. Mirrors `supportedLanguage` +
    // `writeConsentLanguage`; empty for a page that does not receive a language.
    const language = linker.language?.supported != null
      ? `var L=${jsonForScript(linker.language.supported)};` +
        `if(typeof j.l==='string'){var lc=j.l.toLowerCase(),lm=null,q;` +
        `for(q=0;q<L.length;q++){if(String(L[q]).toLowerCase()===lc){lm=L[q];break}}` +
        `if(!lm){lc=lc.split(/[-_]/)[0];for(q=0;q<L.length;q++){if(String(L[q]).toLowerCase()===lc){lm=L[q];break}}}` +
        `if(lm){try{w.localStorage.setItem(${jsonForScript(linker.language.storageKey ?? CONSENT_LANGUAGE_KEY)},lm)}catch(e){}}}`
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
        `if(!existing){` +
          `var keys=${optionalKeys},ok=true;` +
          `for(var i=0;i<keys.length;i++){if(j.c[keys[i]]!==0&&j.c[keys[i]]!==1){ok=false;break}}` +
          `if(ok){` +
            `var cats=${allCategories},rec={v:${version}};` +
            `for(var k=0;k<cats.length;k++){var c=cats[k];rec[c.key]=c.required||j.c[c.key]===1}` +
            `var val=JSON.stringify(rec);` +
            `try{w.localStorage.setItem(${storageKey},val)}catch(e){}` +
            `var exp=new Date(Date.now()+${cookieDays}*86400000).toUTCString();` +
            `d.cookie=${storageKey}+'='+val+';expires='+exp+';path=/;SameSite=Lax'` +
          `}` +
        `}` +
        language +
      `}catch(e){}` +
    `})(window,document)`
  }

  return {
    encodeConsentLink, decodeConsentLink, writeConsentLanguage, consentLinker, stripConsentLinkParam,
    consentLinkerScript,
  }
}

export const consentLinkHelper = createConsentLinkHelper()

/** @deprecated compat:factory-refactor — use `consentLinkHelper.encodeConsentLink(…)` */
export const encodeConsentLink = (record: ConsentRecord | null, opts?: ConsentOptions): string =>
  consentLinkHelper.encodeConsentLink(record, opts)

/** @deprecated compat:factory-refactor — use `consentLinkHelper.consentLinkerScript(…)` */
export const consentLinkerScript = (opts: ConsentOptions): string => consentLinkHelper.consentLinkerScript(opts)
