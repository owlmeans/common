import { resolveTerms, termsAccepted } from '@owlmeans/client-auth/login'
import type { LoginLandingHook } from '@owlmeans/client-auth/login'
import type { LoginTermsConfig } from '@owlmeans/config'
import { MARKETING_CONSENT_LANDING_HOOK_SYNC, MARKETING_CONSENT_LANDING_HOOK_TERMS } from './consts.js'
import type { MarketingConsentClientService } from './service.js'

/**
 * Records a fresh terms acceptance once a sign-in lands, mirroring server-side the acceptance
 * `@owlmeans/client-auth`'s own sign-in screen already confirmed locally (`termsAccepted`,
 * `localStorage`) before the flow was ever allowed to start. A config with terms disabled, or a
 * person who has not (yet) locally accepted, records nothing.
 */
export const termsRecorder = (
  loginTermsConfig: LoginTermsConfig | false | undefined,
  client: MarketingConsentClientService,
  locale?: string,
): LoginLandingHook => ({
  alias: MARKETING_CONSENT_LANDING_HOOK_TERMS,
  priority: 100,
  landed: async () => {
    const resolved = resolveTerms(loginTermsConfig)
    if (resolved == null || !resolved.required || !termsAccepted(resolved)) {
      return
    }

    await client.recordTerms({
      documents: resolved.documents.map(doc => ({ key: doc.key, href: doc.href, revisedAt: doc.revisedAt })),
      notices: resolved.notices.map(doc => ({ key: doc.key, href: doc.href, revisedAt: doc.revisedAt })),
      version: resolved.version,
      locale,
    })
  },
})

/**
 * Reconciles every registered `MarketingConsentBridge` once a sign-in lands:
 *
 * - A device that already has cookie decisions but no saved account decisions SEEDS the account
 *   (`client.save` with `source: 'cookie'`).
 * - An account that already has decisions but a fresh device with none SEEDS the device
 *   (`bridge.write`).
 * - Both present (and possibly differing), or neither present: nothing is overwritten — the safer
 *   of two wrong guesses is to leave two already-made choices alone rather than silently pick one.
 */
export const landingSync = (client: MarketingConsentClientService): LoginLandingHook => ({
  alias: MARKETING_CONSENT_LANDING_HOOK_SYNC,
  priority: 90,
  landed: async () => {
    const status = await client.status({ fresh: true })
    if (status == null) {
      return
    }

    const defs = status.items.map(item => item.definition)

    for (const bridge of client.bridges()) {
      const device = bridge.read(defs)
      const deviceHasAny = device != null && Object.keys(device).length > 0

      const accountDecisions: Record<string, boolean> = {}
      let accountHasAny = false
      for (const item of status.items) {
        if (item.definition.cookieCategory != null && item.saved != null) {
          accountDecisions[item.definition.key] = item.saved.granted
          accountHasAny = true
        }
      }

      if (!deviceHasAny && accountHasAny) {
        bridge.write(accountDecisions, defs)
      } else if (deviceHasAny && !accountHasAny) {
        await client.save({
          decisions: Object.entries(device).map(([key, granted]) => ({ key, granted })),
          source: 'cookie',
        })
      }
      // Both present, or neither: nothing here overwrites the other.
    }
  },
})
