import {
  CONSENT_FUNCTIONAL, CONSENT_KEY, CONSENT_LANGUAGE_EVENT, CONSENT_PENDING_LANGUAGE,
  DEFAULT_CONSENT_CATEGORIES,
} from './consts.js'
import { purgeFunctionalStorage } from './functional.js'
import { applyConsent, pushConsentDefaults } from './gtm.js'
import { consentLinker, stripConsentLinkParam, writeConsentLanguage } from './linker.js'
import { adoptConsent, adoptConsentLanguage, registerConsentPlugin, startConsentPlugins } from './plugins.js'
import { readConsent, writeConsent } from './storage.js'
import type {
  ConsentListener, ConsentOptions, ConsentReason, ConsentRecord, ConsentState, ConsentStore,
} from './types.js'

/**
 * The consent state of this DOCUMENT.
 *
 * A module singleton rather than something hung off a context, because that is what consent
 * actually is — a property of the browser and the page, not of one component tree. It also has to
 * be reachable from places that are not React at all: the sign-in precondition runs inside a click
 * handler, and a tag-manager helper runs before any component has mounted.
 */
export const makeConsentStore = (): ConsentStore => {
  const listeners = new Set<ConsentListener>()
  let state: ConsentState = { record: null, open: false, reason: null }
  let options: ConsentOptions = {}
  // A language that arrived with a link (or was chosen) before the visitor granted functional
  // storage. Memory only — it is never written until the grant, and it dies with the page.
  let pendingLanguage: string | null = null

  const publish = (next: Partial<ConsentState>): void => {
    state = { ...state, ...next }
    listeners.forEach(listener => listener(state))
  }

  /**
   * Bring functional storage in line with the record, now.
   *
   * Granted: a language that was waiting is written, and the application is told (`CONSENT_LANGUAGE_EVENT`)
   * so it can switch this very page instead of the next load. Not granted — a refusal, a withdrawal,
   * or a record that never answered the question — every functional key is REMOVED: a preference
   * must not outlive the consent to remember it. What was waiting stays waiting; the visitor may
   * still grant it later in this page's life.
   */
  const settleFunctional = (): void => {
    if (state.record?.[CONSENT_FUNCTIONAL] !== true) {
      purgeFunctionalStorage(options)

      return
    }
    if (pendingLanguage == null) {
      return
    }
    const language = pendingLanguage
    pendingLanguage = null
    if (writeConsentLanguage(language, options) && typeof window !== 'undefined'
      && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(CONSENT_LANGUAGE_EVENT, { detail: { language } }))
    }
  }

  const resolved = (): ConsentOptions & { categories: typeof DEFAULT_CONSENT_CATEGORIES, storageKey: string } => ({
    ...options,
    categories: options.categories ?? DEFAULT_CONSENT_CATEGORIES,
    storageKey: options.storageKey ?? CONSENT_KEY,
  })

  const store: ConsentStore = {
    get: () => state,

    subscribe: listener => {
      listeners.add(listener)

      return () => { listeners.delete(listener) }
    },

    init: opts => {
      options = { ...options, ...opts }
      // Before anything is read, so a page with no stored answer still declares what is denied.
      pushConsentDefaults(options)

      if (options.linker != null) {
        // Replace-by-alias (`registerConsentPlugin`), so a second `init` (a re-mounted provider,
        // StrictMode) never double-installs the click listener — `consentLinker().start` also
        // guards itself with its own closured flag, belt and braces.
        registerConsentPlugin(consentLinker())
        startConsentPlugins(options)
      }

      let record = readConsent(options)
      // Only when THIS document has no decision yet — an existing one always wins, exactly as the
      // ordinary "ask" path would never overwrite a stored record either.
      if (record == null && options.linker != null) {
        record = adoptConsent(options)
        if (record != null) {
          writeConsent(record, options)
        }
      }
      if (options.linker != null) {
        // What the link carried, or what the inline head fragment already took off it and left on
        // `window` (it strips the parameter, so this is the only place that still knows). Held, not
        // written: whether it may be stored is settled below, against the record.
        const win = typeof window !== 'undefined' ? window as unknown as Record<string, unknown> : null
        const inline = win?.[CONSENT_PENDING_LANGUAGE]
        pendingLanguage = adoptConsentLanguage(options) ?? (typeof inline === 'string' ? inline : pendingLanguage)
        if (win != null && inline !== undefined) {
          delete win[CONSENT_PENDING_LANGUAGE]
        }
        // Always, whether or not anything was adopted — a stale or foreign parameter is exactly as
        // much noise in the visible URL as an adopted one, and a page that already had its own
        // decision may still have arrived with one attached.
        stripConsentLinkParam(options)
      }

      if (record != null) {
        applyConsent(record, options)
        publish({ record, open: false, reason: null })
        settleFunctional()

        return
      }
      publish({ record: null, open: true, reason: 'initial' })
      settleFunctional()
    },

    save: record => {
      writeConsent(record, options)
      applyConsent(record, options)
      publish({ record, open: false, reason: null })
      // After the record is stored: `writeConsentLanguage` reads it back to decide.
      settleFunctional()
    },

    acceptAll: () => {
      const record: ConsentRecord = Object.fromEntries(
        resolved().categories.map(category => [category.key, true])
      )
      store.save(record)
    },

    open: (reason?: ConsentReason) => { publish({ open: true, reason: reason ?? 'reopen' }) },

    close: () => { publish({ open: false, reason: null }) },

    granted: key => {
      const category = resolved().categories.find(candidate => candidate.key === key)
      if (category?.required === true) {
        return true
      }

      return state.record?.[key] === true
    },

    options: resolved,

    pendingLanguage: () => pendingLanguage,
  }

  return store
}

export const consentStore: ConsentStore = makeConsentStore()

/** Open the preferences dialog from anywhere — a footer link, a policy page, a login gate. */
export const openConsent = (reason?: ConsentReason): void => consentStore.open(reason)

/** Whether a category is granted, for the callers that are not components. */
export const isConsented = (key: string): boolean => consentStore.granted(key)
