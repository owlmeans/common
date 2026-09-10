import { CONSENT_KEY, DEFAULT_CONSENT_CATEGORIES } from './consts.js'
import { applyConsent, pushConsentDefaults } from './gtm.js'
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
      pushConsentDefaults(options)

      const record = readConsent(options)
      if (record != null) {
        applyConsent(record, options)
        publish({ record, open: false, reason: null })

        return
      }
      publish({ record: null, open: true, reason: 'initial' })
    },

    save: record => {
      writeConsent(record, options)
      applyConsent(record, options)
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

/** Open the preferences dialog from anywhere — a footer link, a policy page, a login gate. */
export const openConsent = (reason?: ConsentReason): void => consentStore.open(reason)

/** Whether a category is granted, for the callers that are not components. */
export const isConsented = (key: string): boolean => consentStore.granted(key)
