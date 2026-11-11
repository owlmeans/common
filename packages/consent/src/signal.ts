import { CONSENT_EVENT, DEFAULT_CONSENT_CATEGORIES } from './consts.js'
import type { ConsentOptions, ConsentRecord } from './types.js'
import type { ConsentWindow } from './types.local.js'
import type { ConsentSignalHelper, ConsentSignalProvider } from './signal/types.js'

/**
 * Module-global by design, like the consent-plugin registry: consent is one thing per document, and
 * a provider is registered once at bundle scope regardless of how many components read the store.
 */
const providers = new Map<string, ConsentSignalProvider>()

export const createConsentSignalHelper = (): ConsentSignalHelper => {
  const global = (): ConsentWindow | null =>
    typeof window !== 'undefined' ? window as unknown as ConsentWindow : null

  const register = (provider: ConsentSignalProvider): void => {
    providers.set(provider.id, provider)
  }

  const unregister = (id: string): void => {
    providers.delete(id)
  }

  const get = (id: string): ConsentSignalProvider | null => providers.get(id) ?? null

  const list = (): ConsentSignalProvider[] => [...providers.values()]

  const clear = (): void => {
    providers.clear()
  }

  const each = (run: (provider: ConsentSignalProvider) => void): void => {
    for (const provider of list()) {
      try {
        run(provider)
      } catch {
        // One provider's failure is its own: the others still signal, and the event still fires.
      }
    }
  }

  const defaults = (opts?: ConsentOptions): void => {
    if (global() == null || opts?.silent === true) {
      return
    }
    each(provider => provider.defaults(opts ?? {}))
  }

  const apply = (record: ConsentRecord, opts?: ConsentOptions): void => {
    const win = global()
    if (win == null || opts?.silent === true) {
      return
    }

    for (const category of opts?.categories ?? DEFAULT_CONSENT_CATEGORIES) {
      if (category.globalVar != null) {
        win[category.globalVar] = category.required === true || record[category.key] === true
      }
    }

    each(provider => provider.apply(record, opts ?? {}))

    // A gate script (`consentTrackingHelper.consentGateScript`) that already decided NOT to load,
    // because nothing was granted at the time it ran, has no other way to hear this.
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { record } }))
    }
  }

  return { register, unregister, get, list, clear, defaults, apply }
}

export const consentSignalHelper = createConsentSignalHelper()
