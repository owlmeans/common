import {
  CONSENT_EVENT, CONSENT_KEY, CONSENT_SETUP_FLAG, CONSENT_SIGNAL_DEFAULTS,
  DEFAULT_CONSENT_CATEGORIES,
} from './consts.js'
import { consentLinkerScript } from './linker.js'
import type { ConsentCategory, ConsentOptions, ConsentRecord } from './types.js'

interface ConsentWindow {
  dataLayer?: unknown[]
  [flag: string]: unknown
}

const global = (): ConsentWindow | null =>
  typeof window !== 'undefined' ? window as unknown as ConsentWindow : null

/**
 * Push onto the tag-manager queue in the shape Google's own snippet uses.
 *
 * `arguments`, not an array literal. Both work with today's Consent API, but `arguments` is what
 * `gtag.js` itself emits, and a page that carries both this and Google's snippet should not have
 * two shapes in one queue.
 */
export function gtagConsent(..._args: unknown[]): void {
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

/** Every signal the configured categories drive, at its pre-consent value. */
export const consentDefaults = (
  categories?: ConsentCategory[]
): Record<string, 'granted' | 'denied'> => {
  const used = new Set((categories ?? DEFAULT_CONSENT_CATEGORIES)
    .flatMap(category => category.signals ?? []))

  return Object.fromEntries(Object.entries(CONSENT_SIGNAL_DEFAULTS)
    .filter(([signal]) => used.has(signal as never)))
}

/** Every signal, at the value this record implies. */
export const consentUpdate = (
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

/**
 * Declare what is denied, before any tag can act.
 *
 * Idempotent through a window flag, because the page may carry this call twice — once inline in
 * the document head, once from whatever bundle mounts the dialog — and a second `default` after a
 * tag has loaded is worse than none: it can widen what was already narrowed.
 */
export const pushConsentDefaults = (opts?: ConsentOptions): void => {
  const win = global()
  if (win == null || opts?.silent === true || win[CONSENT_SETUP_FLAG] === true) {
    return
  }
  gtagConsent('consent', 'default', consentDefaults(categoriesOf(opts)))
  win[CONSENT_SETUP_FLAG] = true
}

/**
 * Apply a decision: globals first, then the signal update, then any per-category events.
 *
 * The order is load-bearing. A tag that fires on the update event reads the globals in the same
 * turn, so writing them afterwards would let the first firing see the previous answer.
 */
export const applyConsent = (record: ConsentRecord, opts?: ConsentOptions): void => {
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

/**
 * Whether a stored decision grants tracking at all — a signal-bearing category, not merely the
 * required essential one.
 *
 * "Signal-bearing" is what a required category can never be: it exists to gate whether a LOADER
 * runs, and a required category is disclosure, not a question — everyone gets it. Only a category
 * that both is optional and drives at least one Consent Mode signal counts, which is exactly what
 * `googleTagHeadScript`'s `'basic'` mode gates a Google tag behind.
 */
export const trackingGranted = (
  record: ConsentRecord | null, categories: ConsentCategory[] = DEFAULT_CONSENT_CATEGORIES
): boolean => record != null && categories.some(
  category => !category.required && (category.signals?.length ?? 0) > 0 && record[category.key] === true
)

/**
 * The inline script a document stamps ABOVE its tag-manager snippet.
 *
 * It exists because the defaults have to be on the queue before `gtm.js` loads, and a React bundle
 * cannot be: by the time an island mounts, the container has been running for hundreds of
 * milliseconds and has already decided what it may do. Emitting it from the HTML is the only
 * ordering that holds — and it reads the stored record too, so a returning visitor's tags are not
 * denied for the first paint of every page.
 */
export const consentBootstrapScript = (opts?: ConsentOptions): string => {
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
  const linker = opts?.linker != null ? `${consentLinkerScript(opts)};` : ''

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

/**
 * Withhold a loader until a stored or later decision grants tracking.
 *
 * The counterpart to `consentBootstrapScript` for the `'basic'` gated loading mode
 * (`@owlmeans/web-gtm`'s `GOOGLE_TAG_DEFAULT_MODE`): where the bootstrap always declares Consent
 * Mode's defaults so a tag may load cookieless, this withholds the tag itself — the loader string
 * is only ever reached once `trackingGranted` is true, either because a returning visitor's stored
 * record already says so, or because `applyConsent` later dispatches {@link CONSENT_EVENT} with
 * one that does. The listener removes itself on the first passing event, so the loader — which
 * marks its own element and refuses to run twice — is asked to run at most once from here.
 *
 * `loaderExpr` is a complete statement or expression that runs the loader when reached — the
 * self-invoking IIFE string `googleTagHeadScript`'s `gtagScript`/`gtmContainerScript` already
 * produce, embedded here verbatim rather than called. It is placed inline exactly as
 * `consentBootstrapScript`'s own output is: dynamic values (the storage key, the category shape,
 * the event name) are JSON-encoded so nothing configured can break out of a string literal, and
 * escaping the RESULT for HTML (`</script`, `<!--`) is left to whoever composes the final inline
 * script — the same discipline `consentBootstrapScript` follows, and `googleTagHeadScript` already
 * applies to the whole script it stamps.
 */
export const consentGateScript = (
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
