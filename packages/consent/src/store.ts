import { CONSENT_KEY, DEFAULT_CONSENT_CATEGORIES } from './consts.js'
import { consentModeHelper } from './gtm.js'
import { consentLinkHelper } from './linker.js'
import { consentPluginHelper } from './plugins.js'
import { consentStorageHelper } from './storage.js'
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

  const publish = (next: Partial<ConsentState>): void => {
    state = { ...state, ...next }
    listeners.forEach(listener => listener(state))
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
      consentModeHelper.pushConsentDefaults(options)

      if (options.linker != null) {
        // Replace-by-alias (`registerConsentPlugin`), so a second `init` (a re-mounted provider,
        // StrictMode) never double-installs the click listener — `consentLinker().start` also
        // guards itself with its own closured flag, belt and braces.
        consentPluginHelper.registerConsentPlugin(consentLinkHelper.consentLinker())
        consentPluginHelper.startConsentPlugins(options)
      }

      let record = consentStorageHelper.readConsent(options)
      // Only when THIS document has no decision yet — an existing one always wins, exactly as the
      // ordinary "ask" path would never overwrite a stored record either.
      if (record == null && options.linker != null) {
        record = consentPluginHelper.adoptConsent(options)
        if (record != null) {
          consentStorageHelper.writeConsent(record, options)
        }
      }
      if (options.linker != null) {
        // The language the link carried, stored at once — the interface language is strictly
        // necessary storage, so no decision is consulted. A page that stamped the inline head
        // fragment has already done this and stripped the parameter, which leaves nothing here.
        const carried = consentPluginHelper.adoptConsentLanguage(options)
        if (carried != null) {
          consentLinkHelper.writeConsentLanguage(carried, options)
        }
        // Always, whether or not anything was adopted — a stale or foreign parameter is exactly as
        // much noise in the visible URL as an adopted one, and a page that already had its own
        // decision may still have arrived with one attached.
        consentLinkHelper.stripConsentLinkParam(options)
      }

      if (record != null) {
        consentModeHelper.applyConsent(record, options)
        publish({ record, open: false, reason: null })

        return
      }
      publish({ record: null, open: true, reason: 'initial' })
    },

    save: record => {
      consentStorageHelper.writeConsent(record, options)
      consentModeHelper.applyConsent(record, options)
      publish({ record, open: false, reason: null })
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
  }

  return store
}

export const consentStore: ConsentStore = makeConsentStore()

/** @deprecated compat:factory-refactor — use `consentStore.open(…)` */
export const openConsent = (reason?: ConsentReason): void => consentStore.open(reason)

/** @deprecated compat:factory-refactor — use `consentStore.granted(…)` */
export const isConsented = (key: string): boolean => consentStore.granted(key)
