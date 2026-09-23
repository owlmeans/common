import { CONSENT_ESSENTIAL, DEFAULT_CONSENT_CATEGORIES, consentStore } from '@owlmeans/consent'
import type { ConsentOptions, ConsentRecord } from '@owlmeans/consent'
import type { MarketingConsentBridge } from '@owlmeans/marketing-consent'

export interface MakeCookieConsentBridgeOptions {
  /**
   * The SAME options the app passes to `consentStore.init(...)` elsewhere (e.g. via
   * `@owlmeans/web-consent`'s dialog mount) — read here only to find which category key is the
   * required "essential" one, so `write` re-asserts the right key even when a host renamed it.
   * This bridge never calls `consentStore.init` itself; a marketing-consent screen has no opinion
   * about whether a cookie dialog exists at all.
   */
  storageOptions?: ConsentOptions
}

/**
 * The seam between a person's saved marketing-consent DECISIONS (server-held, per account) and
 * this browser's cookie-consent RECORD (`@owlmeans/consent`'s `consentStore`, per device) — for
 * every definition whose `cookieCategory` names a `@owlmeans/consent` category
 * (`trackers.analytics` -> `CONSENT_ANALYTICS`, `trackers.advertising` -> `CONSENT_MARKETING`).
 *
 * `consentStore.save` REPLACES the stored record wholesale — `store.ts`'s `save` calls
 * `writeConsent(record, options)` with exactly what it is given, no merge of its own — so `write`
 * always spreads the CURRENT record first and always re-asserts the essential category, before
 * patching in only the categories THIS bridge owns.
 */
export const cookieConsentBridge = (opts?: MakeCookieConsentBridgeOptions): MarketingConsentBridge => {
  const categories = opts?.storageOptions?.categories ?? DEFAULT_CONSENT_CATEGORIES
  const essentialKey = categories.find(category => category.required === true)?.key ?? CONSENT_ESSENTIAL

  // Re-entrancy guard: `write` calling `consentStore.save` publishes to every subscriber of the
  // store, including the one `subscribe` below registers — without this, saving a marketing
  // decision through this bridge would immediately hand the SAME change back to a caller that
  // reacts to it by writing again (a naive two-way binding), looping the two writes forever.
  let suppress = false

  return {
    alias: 'cookie-consent',

    read: defs => {
      const record = consentStore.get().record
      if (record == null) {
        return null
      }

      const out: Record<string, boolean> = {}
      for (const definition of defs) {
        if (definition.cookieCategory != null) {
          out[definition.key] = record[definition.cookieCategory] === true
        }
      }

      return out
    },

    write: (decisions, defs) => {
      const current: ConsentRecord = consentStore.get().record ?? {}
      const patch: Partial<ConsentRecord> = {}
      for (const definition of defs) {
        if (definition.cookieCategory != null && decisions[definition.key] != null) {
          patch[definition.cookieCategory] = decisions[definition.key]
        }
      }
      if (Object.keys(patch).length === 0) {
        return
      }

      suppress = true
      try {
        consentStore.save({ ...current, [essentialKey]: true, ...patch })
      } finally {
        suppress = false
      }
    },

    subscribe: (listener, defs) => consentStore.subscribe(state => {
      if (suppress || state.record == null) {
        return
      }
      const out: Record<string, boolean> = {}
      for (const definition of defs) {
        if (definition.cookieCategory != null) {
          out[definition.key] = state.record[definition.cookieCategory] === true
        }
      }
      listener(out)
    }),
  }
}
