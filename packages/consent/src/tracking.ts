import { CONSENT_AUTO_MAX_AGE, CONSENT_EVENT, CONSENT_KEY, DEFAULT_CONSENT_CATEGORIES } from './consts.js'
import { AUTO_SKEW } from './consts.local.js'
import { consentLinkHelper } from './linker.js'
import { consentSignalHelper } from './signal.js'
import type { ConsentCategory, ConsentOptions, ConsentRecord } from './types.js'
import type { ConsentModeHelper, ConsentTrackingHelper } from './tracking/types.js'

export const createConsentTrackingHelper = (): ConsentTrackingHelper => {
  const categoriesOf = (opts?: ConsentOptions): ConsentCategory[] =>
    opts?.categories ?? DEFAULT_CONSENT_CATEGORIES

  const trackingGranted = (
    record: ConsentRecord | null, categories: ConsentCategory[] = DEFAULT_CONSENT_CATEGORIES
  ): boolean => record != null && categories.some(
    category => category.required !== true && category.tracking === true && record[category.key] === true
  )

  const storageReadScript = (opts?: ConsentOptions): string => {
    const storageKey = JSON.stringify(opts?.storageKey ?? CONSENT_KEY)

    return `var raw=null;try{raw=w.localStorage.getItem(${storageKey})}catch(e){}` +
      `if(!raw){var p=('; '+d.cookie).split('; '+${storageKey}+'=');` +
      `if(p.length===2){raw=p.pop().split(';').shift()}}`
  }

  const staleAutoScript = (onStale: string): string =>
    `if(r&&typeof r.auto==='number'){var a=Math.floor(Date.now()/1000)-r.auto;` +
    `if(a>${CONSENT_AUTO_MAX_AGE}||a<-${AUTO_SKEW}){${onStale}}}`

  const consentBootstrapScript = (opts?: ConsentOptions): string => {
    const categories = JSON.stringify(categoriesOf(opts)
      .filter(category => category.globalVar != null)
      .map(category => ({
        key: category.key, required: category.required === true, globalVar: category.globalVar,
      })))
    // First, before the storage read below (and before a gate script concatenated after this whole
    // IIFE): an adopted decision must already be in storage by the time anything reads it.
    const linker = opts?.linker != null ? `${consentLinkHelper.consentLinkerScript(opts)};` : ''

    return `(function(w,d){` +
      linker +
      storageReadScript(opts) +
      `if(!raw)return;var r;try{r=JSON.parse(raw)}catch(e){return}` +
      staleAutoScript('return') +
      `var cs=${categories};` +
      `for(var i=0;i<cs.length;i++){var c=cs[i];w[c.globalVar]=c.required||r[c.key]===true}` +
      `})(window,document)`
  }

  const consentGateScript = (loaderExpr: string, opts?: ConsentOptions): string => {
    // `hasSignal` is the inline field's long-standing name for "may grant tracking". A required
    // category is emitted `true`, as the default essential one always was: `!c.required` vetoes it
    // before the flag is read, and keeping the value keeps the emitted script byte-identical for
    // pages served under a hash-based CSP.
    const gate = JSON.stringify(categoriesOf(opts).map(category => ({
      key: category.key,
      required: category.required === true,
      hasSignal: category.required === true || category.tracking === true,
    })))
    const event = JSON.stringify(CONSENT_EVENT)

    return `(function(w,d){` +
      `function ok(r){if(!r)return false;var cs=${gate};` +
      `for(var i=0;i<cs.length;i++){var c=cs[i];` +
      `if(!c.required&&c.hasSignal&&r[c.key]===true)return true}return false}` +
      `function load(){${loaderExpr}}` +
      storageReadScript(opts) +
      `var r=null;if(raw){try{r=JSON.parse(raw)}catch(e){r=null}}` +
      staleAutoScript('r=null') +
      `if(ok(r)){load();return}` +
      `function h(ev){if(ok(ev&&ev.detail&&ev.detail.record)){` +
      `w.removeEventListener(${event},h);load()}}` +
      `w.addEventListener(${event},h)` +
      `})(window,document)`
  }

  return { trackingGranted, consentBootstrapScript, consentGateScript, storageReadScript, staleAutoScript }
}

export const consentTrackingHelper = createConsentTrackingHelper()

/**
 * @deprecated compat:consent-signals — use `consentTrackingHelper` (and `consentSignalHelper` for
 * the two decision members). Only its provider-free members remain, delegating there, so a
 * generated target's build script importing it keeps building; `consentBootstrapScript` now declares
 * no signal (a page whose tag needs signal defaults stamps that tag's own head bootstrap).
 */
export const consentModeHelper: ConsentModeHelper = {
  trackingGranted: (record, categories) => consentTrackingHelper.trackingGranted(record, categories),
  consentBootstrapScript: opts => consentTrackingHelper.consentBootstrapScript(opts),
  consentGateScript: (loaderExpr, opts) => consentTrackingHelper.consentGateScript(loaderExpr, opts),
  pushConsentDefaults: opts => consentSignalHelper.defaults(opts),
  applyConsent: (record, opts) => consentSignalHelper.apply(record, opts),
}

/** @deprecated compat:factory-refactor — use `consentTrackingHelper.consentBootstrapScript(…)` */
export const consentBootstrapScript = (opts?: ConsentOptions): string => consentTrackingHelper.consentBootstrapScript(opts)
