import {
  CONSENT_IDLE_STATE, CONSENT_KEY, CONSENT_STATE_ATTRIBUTE, DEFAULT_CONSENT_CATEGORIES,
} from './consts.js'
import { CLOUDFLARE_LOCATOR_ALIAS } from './consts.local.js'
import { consentModeHelper } from './gtm.js'
import { consentGeoHelper } from './geo.js'
import { consentLinkHelper } from './linker.js'
import { consentPluginHelper } from './plugins.js'
import { consentStorageHelper } from './storage.js'
import type {
  ConsentListener, ConsentOptions, ConsentReason, ConsentRecord, ConsentState, ConsentStore,
} from './types.js'
import type { ConsentGeoVerdict } from './geo/types.js'

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
  const waiting = new Set<(state: ConsentState) => void>()
  let state: ConsentState = CONSENT_IDLE_STATE
  let options: ConsentOptions = {}
  /** The one country lookup of this document, while it runs. */
  let lookup: Promise<void> | null = null
  /** What the last lookup decided — a later `init` never locates the same visitor twice. */
  let verdict: ConsentGeoVerdict | null = null

  /** `<html data-consent>`: what a test waits on and a stylesheet may key on. */
  const mark = (): void => {
    const root = typeof document !== 'undefined' ? document.documentElement : undefined
    if (root == null || typeof root.setAttribute !== 'function') {
      return
    }
    root.setAttribute(CONSENT_STATE_ATTRIBUTE, state.open ? 'open'
      : state.locating != null ? 'locating'
        : state.record != null ? 'decided' : 'idle')
  }

  const publish = (next: Partial<ConsentState>): void => {
    state = { ...state, ...next }
    mark()
    listeners.forEach(listener => listener(state))
    if (state.locating == null && lookup == null && waiting.size > 0) {
      const settled = [...waiting]
      waiting.clear()
      settled.forEach(resolve => resolve(state))
    }
  }

  const resolved = (): ConsentOptions & { categories: typeof DEFAULT_CONSENT_CATEGORIES, storageKey: string } => ({
    ...options,
    categories: options.categories ?? DEFAULT_CONSENT_CATEGORIES,
    storageKey: options.storageKey ?? CONSENT_KEY,
  })

  const ask = (): void => {
    publish({ record: null, open: true, reason: 'initial', locating: null })
  }

  /**
   * What a finished lookup does — unless the visitor got there first: a decision saved meanwhile, or
   * the window opened for a reason of its own (signing in), always wins over the location.
   */
  const settle = (result: ConsentGeoVerdict, pending: ConsentRecord | null): void => {
    verdict = result
    lookup = null
    if (state.record != null || (state.open && state.reason !== 'initial')) {
      publish({ locating: null })

      return
    }
    if (result === 'auto') {
      const record = consentGeoHelper.automaticRecord(resolved())
      consentStorageHelper.writeConsent(record, options)
      consentModeHelper.applyConsent(record, options)
      publish({ record, open: false, reason: null, locating: null })

      return
    }
    if (pending != null) {
      // A grant derived somewhere nobody had to be asked does not survive arriving where they must.
      consentStorageHelper.clearConsent(options)
    }
    ask()
  }

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
        // Registered once: `start` installs the click listener of THAT instance, and a second
        // instance (a second `init` — a re-mounted provider, StrictMode, `loadGtm`) would install
        // its own beside it.
        if (!consentPluginHelper.consentPlugins().some(plugin => plugin.alias === 'linker')) {
          consentPluginHelper.registerConsentPlugin(consentLinkHelper.consentLinker())
        }
        consentPluginHelper.startConsentPlugins(options)
      }
      if (options.geo?.cloudflare != null && options.geo.cloudflare !== false
        && !consentPluginHelper.consentPlugins().some(plugin => plugin.alias === CLOUDFLARE_LOCATOR_ALIAS)) {
        consentPluginHelper.registerConsentPlugin(consentGeoHelper.cloudflareLocator())
      }

      let record = consentStorageHelper.readConsent(options)
      const automatic = consentGeoHelper.autoState(record)
      // An automatic decision past its age is held back — applied nowhere — until the visitor is
      // located again, exactly as the head scripts already skipped it.
      const pending = automatic === 'stale' ? record : null
      if (pending != null) {
        record = null
      }
      // An explicit decision carried from another domain always beats none — and beats an automatic
      // one, which nobody chose. An explicit stored one always wins, as the ordinary "ask" path
      // would never overwrite it either.
      if ((record == null || automatic != null) && options.linker != null) {
        const adopted = consentPluginHelper.adoptConsent(options)
        if (adopted != null) {
          consentStorageHelper.writeConsent(adopted, options)
          record = adopted
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
        publish({ record, open: false, reason: null, locating: null })

        return
      }
      if (lookup != null) {
        return
      }
      // The window is already open for a reason of its own (signing in): the visitor is answering.
      if (state.open && state.reason !== 'initial') {
        return
      }
      if (verdict === 'ask' || !consentGeoHelper.enabled(options)) {
        ask()

        return
      }
      // A first visit waits behind the spinner; a re-check runs silently, nothing applied meanwhile.
      publish({ record: null, open: false, reason: null, locating: pending != null ? 'recheck' : 'first' })
      lookup = consentGeoHelper.decide(options).then(result => settle(result, pending))
    },

    save: record => {
      const { auto: _auto, ...explicit } = record
      consentStorageHelper.writeConsent(explicit, options)
      consentModeHelper.applyConsent(explicit, options)
      publish({ record: explicit, open: false, reason: null, locating: null })
    },

    acceptAll: () => {
      const record: ConsentRecord = Object.fromEntries(
        resolved().categories.map(category => [category.key, true])
      )
      store.save(record)
    },

    open: (reason?: ConsentReason) => {
      publish({ open: true, reason: reason ?? 'reopen', locating: null })
    },

    close: () => { publish({ open: false, reason: null }) },

    granted: key => {
      const category = resolved().categories.find(candidate => candidate.key === key)
      if (category?.required === true) {
        return true
      }

      return state.record?.[key] === true
    },

    options: resolved,

    settled: () => state.locating == null && lookup == null
      ? Promise.resolve(state)
      : new Promise(resolve => { waiting.add(resolve) }),
  }

  return store
}

export const consentStore: ConsentStore = makeConsentStore()

/** @deprecated compat:factory-refactor — use `consentStore.open(…)` */
export const openConsent = (reason?: ConsentReason): void => consentStore.open(reason)

/** @deprecated compat:factory-refactor — use `consentStore.granted(…)` */
export const isConsented = (key: string): boolean => consentStore.granted(key)
