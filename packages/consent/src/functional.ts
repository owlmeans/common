import { CONSENT_FUNCTIONAL, CONSENT_KEY, CONSENT_LANGUAGE_KEY } from './consts.js'
import { readConsent } from './storage.js'
import type { ConsentOptions } from './types.js'

/**
 * Whether this document's visitor has granted functional storage — a preference they set, such as
 * the interface language, may be remembered on their device.
 *
 * Read from the stored record every time rather than from the store's state, so it is correct
 * before `consentStore.init` has run: the language resolves at start-up, ahead of any component.
 * A record with no `functional` key (one saved before the category existed) is NOT a grant — the
 * visitor was never asked, and a preference is not remembered on a device nobody asked about.
 */
export const functionalGranted = (opts?: ConsentOptions): boolean =>
  readConsent(opts)?.[CONSENT_FUNCTIONAL] === true

/** Every `localStorage` key that may hold a functional preference for these options. */
export const functionalKeysOf = (opts?: ConsentOptions): string[] => [
  ...new Set([
    ...(opts?.functionalKeys ?? [CONSENT_LANGUAGE_KEY]),
    ...(opts?.linker?.language?.storageKey != null ? [opts.linker.language.storageKey] : []),
  ]),
]

/**
 * Remove every functional preference this application keeps. Called whenever functional is not
 * granted — a refusal, a withdrawal, or a record that never answered — because a preference that
 * outlives the consent to remember it is exactly the storage the visitor did not agree to.
 */
export const purgeFunctionalStorage = (opts?: ConsentOptions): void => {
  for (const key of functionalKeysOf(opts)) {
    try {
      localStorage.removeItem(key)
    } catch { /* storage blocked: nothing was written there to remove */ }
  }
}

/**
 * Remember a functional preference — but only while `functional` is granted. Returns whether it was
 * written. The gate lives here so a caller cannot forget it; an application that is asked to store
 * something functional calls this instead of `localStorage.setItem`.
 */
export const writeFunctionalPreference = (key: string, value: string, opts?: ConsentOptions): boolean => {
  if (!functionalGranted(opts)) {
    return false
  }
  try {
    localStorage.setItem(key, value)

    return true
  } catch {
    return false
  }
}

/**
 * An inline `<head>` fragment that defines `window.owlConsentAllows(category)` — whether the stored
 * decision grants that category — for the scripts of a page that has no bundle yet: a site that
 * remembers the visitor's language choice from a plain inline script (owlmeans.com's language
 * switcher) asks it before it writes anything. Reads the same localStorage-then-cookie pair
 * `readConsent` does, and answers `false` for anything it cannot read or parse — no answer is not a
 * grant. Stamp it before the scripts that call it.
 */
export const consentAllowsScript = (opts?: ConsentOptions): string => {
  const key = JSON.stringify(opts?.storageKey ?? CONSENT_KEY).replace(/</g, '\\u003c')

  return `(function(w,d){w.owlConsentAllows=function(k){` +
    `var raw=null;try{raw=w.localStorage.getItem(${key})}catch(e){}` +
    `if(!raw){var p=('; '+d.cookie).split('; '+${key}+'=');if(p.length===2)raw=p.pop().split(';').shift()}` +
    `if(!raw)return false;` +
    `try{var r=JSON.parse(raw);return !!r&&typeof r==='object'&&r[k]===true}catch(e){return false}}` +
  `})(window,document)`
}
