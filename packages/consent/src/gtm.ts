import {
  CONSENT_EVENT, CONSENT_KEY, CONSENT_SETUP_FLAG, CONSENT_SIGNAL_DEFAULTS,
  DEFAULT_CONSENT_CATEGORIES,
} from './consts.js'
import { consentLinkHelper } from './linker.js'
import type { ConsentCategory, ConsentOptions, ConsentRecord } from './types.js'
import type { ConsentWindow } from './types.local.js'
import type { ConsentModeHelper } from './gtm/types.js'

export const createConsentModeHelper = (): ConsentModeHelper => {
  const global = (): ConsentWindow | null =>
    typeof window !== 'undefined' ? window as unknown as ConsentWindow : null

  // A `function`, not an arrow: what goes on the queue is its own `arguments` object.
  function gtagConsent(..._args: unknown[]): void {
    const win = global()
    if (win == null) {
      return
    }
    win.dataLayer = win.dataLayer ?? []
    // `arguments`, not `_args`. The rest parameter is only here to type the call sites; what goes on
    // the queue must be the arguments object itself.
    // eslint-disable-next-line prefer-rest-params
    win.dataLayer.push(arguments)
  }

  const categoriesOf = (opts?: ConsentOptions): ConsentCategory[] =>
    opts?.categories ?? DEFAULT_CONSENT_CATEGORIES

  const consentDefaults = (
    categories?: ConsentCategory[]
  ): Record<string, 'granted' | 'denied'> => {
    const used = new Set((categories ?? DEFAULT_CONSENT_CATEGORIES)
      .flatMap(category => category.signals ?? []))

    return Object.fromEntries(Object.entries(CONSENT_SIGNAL_DEFAULTS)
      .filter(([signal]) => used.has(signal as never)))
  }

  const consentUpdate = (
    record: ConsentRecord, categories?: ConsentCategory[]
  ): Record<string, 'granted' | 'denied'> => {
    const update: Record<string, 'granted' | 'denied'> = {}
    for (const category of categories ?? DEFAULT_CONSENT_CATEGORIES) {
      const granted = category.required === true || record[category.key] === true
      for (const signal of category.signals ?? []) {
        // A signal named by two categories is granted only when every one of them is.
        update[signal] = granted && update[signal] !== 'denied' ? 'granted' : 'denied'
      }
    }

    return update
  }

  const pushConsentDefaults = (opts?: ConsentOptions): void => {
    const win = global()
    if (win == null || opts?.silent === true || win[CONSENT_SETUP_FLAG] === true) {
      return
    }
    gtagConsent('consent', 'default', consentDefaults(categoriesOf(opts)))
    win[CONSENT_SETUP_FLAG] = true
  }

  const applyConsent = (record: ConsentRecord, opts?: ConsentOptions): void => {
    const win = global()
    if (win == null || opts?.silent === true) {
      return
    }
    const categories = categoriesOf(opts)

    for (const category of categories) {
      if (category.globalVar != null) {
        win[category.globalVar] = category.required === true || record[category.key] === true
      }
    }

    gtagConsent('consent', 'update', consentUpdate(record, categories))

    for (const category of categories) {
      if (category.event != null && (category.required === true || record[category.key] === true)) {
        win.dataLayer = win.dataLayer ?? []
        win.dataLayer.push({ event: category.event })
      }
    }

    // A gate script (`consentGateScript`) that already decided NOT to load, because nothing was
    // granted at the time it ran, has no other way to hear this. Consent Mode itself speaks only on
    // `dataLayer`, which a tag that never loaded is not listening to.
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function'
      && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { record } }))
    }
  }

  const trackingGranted = (
    record: ConsentRecord | null, categories: ConsentCategory[] = DEFAULT_CONSENT_CATEGORIES
  ): boolean => record != null && categories.some(
    category => !category.required && (category.signals?.length ?? 0) > 0 && record[category.key] === true
  )

  const consentBootstrapScript = (opts?: ConsentOptions): string => {
    const defaults = JSON.stringify(consentDefaults(categoriesOf(opts)))
    const categories = JSON.stringify(categoriesOf(opts).map(category => ({
      key: category.key,
      required: category.required === true,
      signals: category.signals ?? [],
      globalVar: category.globalVar ?? null,
    })))
    const storageKey = JSON.stringify(opts?.storageKey ?? CONSENT_KEY)
    const flag = JSON.stringify(CONSENT_SETUP_FLAG)
    // Right after the default is pushed and before EITHER storage read below (this one, and the
    // `consentGateScript` that is concatenated after this whole IIFE) — an adopted decision must
    // already be in storage by the time anything reads it, so `gtm.js`'s own `page_view` never sees
    // the parameter and a granted decision loads the tag on arrival. A page with no `opts.linker`
    // gets an empty string here, unchanged from before this existed.
    const linker = opts?.linker != null ? `${consentLinkHelper.consentLinkerScript(opts)};` : ''

    return `(function(w,d){` +
      `w.dataLayer=w.dataLayer||[];function g(){w.dataLayer.push(arguments)}` +
      `if(w[${flag}])return;g('consent','default',${defaults});w[${flag}]=true;` +
      linker +
      `var raw=null;try{raw=w.localStorage.getItem(${storageKey})}catch(e){}` +
      `if(!raw){var p=('; '+d.cookie).split('; '+${storageKey}+'=');` +
      `if(p.length===2){raw=p.pop().split(';').shift()}}` +
      `if(!raw)return;var r;try{r=JSON.parse(raw)}catch(e){return}` +
      `var cs=${categories},u={};` +
      `for(var i=0;i<cs.length;i++){var c=cs[i];var ok=c.required||r[c.key]===true;` +
      `if(c.globalVar){w[c.globalVar]=ok}` +
      `for(var j=0;j<c.signals.length;j++){var s=c.signals[j];` +
      `u[s]=ok&&u[s]!=='denied'?'granted':'denied'}}` +
      `g('consent','update',u)})(window,document)`
  }

  const consentGateScript = (
    loaderExpr: string, opts?: ConsentOptions & { categories?: ConsentCategory[] }
  ): string => {
    const gate = JSON.stringify(categoriesOf(opts).map(category => ({
      key: category.key,
      required: category.required === true,
      hasSignal: (category.signals ?? []).length > 0,
    })))
    const storageKey = JSON.stringify(opts?.storageKey ?? CONSENT_KEY)
    const event = JSON.stringify(CONSENT_EVENT)

    return `(function(w,d){` +
      `function ok(r){if(!r)return false;var cs=${gate};` +
      `for(var i=0;i<cs.length;i++){var c=cs[i];` +
      `if(!c.required&&c.hasSignal&&r[c.key]===true)return true}return false}` +
      `function load(){${loaderExpr}}` +
      `var raw=null;try{raw=w.localStorage.getItem(${storageKey})}catch(e){}` +
      `if(!raw){var p=('; '+d.cookie).split('; '+${storageKey}+'=');` +
      `if(p.length===2){raw=p.pop().split(';').shift()}}` +
      `var r=null;if(raw){try{r=JSON.parse(raw)}catch(e){r=null}}` +
      `if(ok(r)){load();return}` +
      `function h(ev){if(ok(ev&&ev.detail&&ev.detail.record)){` +
      `w.removeEventListener(${event},h);load()}}` +
      `w.addEventListener(${event},h)` +
      `})(window,document)`
  }

  return {
    gtagConsent, consentDefaults, consentUpdate, pushConsentDefaults, applyConsent, trackingGranted,
    consentBootstrapScript, consentGateScript,
  }
}

export const consentModeHelper = createConsentModeHelper()

/** @deprecated compat:factory-refactor — use `consentModeHelper.consentBootstrapScript(…)` */
export const consentBootstrapScript = (opts?: ConsentOptions): string => consentModeHelper.consentBootstrapScript(opts)
