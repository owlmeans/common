import { useEffect, useSyncExternalStore } from 'react'
import { consentStore } from '@owlmeans/consent'
import type { ConsentOptions } from '@owlmeans/consent'
import type { UseConsentModel } from './types.js'

/**
 * Subscribe to this document's consent state.
 *
 * `useSyncExternalStore` rather than local state, because consent is one thing per document and
 * several components read it — the dialog, the re-open button, the policy page, and whatever a
 * host app gates on it. Local copies would disagree the moment one of them saved.
 */
export const useConsent = (opts?: ConsentOptions): UseConsentModel => {
  const state = useSyncExternalStore(
    listener => consentStore.subscribe(listener),
    () => consentStore.get(),
    // On the server there is no browser to have an opinion, and rendering the dialog into static
    // HTML would flash it for every visitor before hydration corrected them.
    () => ({ record: null, open: false, reason: null })
  )

  useEffect(() => { consentStore.init(opts) }, [])

  return {
    record: state.record,
    open: state.open,
    reason: state.reason,
    granted: key => consentStore.granted(key),
    save: record => consentStore.save(record),
    acceptAll: () => consentStore.acceptAll(),
    openDialog: reason => consentStore.open(reason),
    close: () => consentStore.close(),
  }
}

/** Whether one category is granted. For a component that gates a single thing. */
export const useConsentCategory = (key: string): boolean => {
  const state = useSyncExternalStore(
    listener => consentStore.subscribe(listener),
    () => consentStore.get(),
    () => ({ record: null, open: false, reason: null })
  )

  return state.record != null && consentStore.granted(key)
}
