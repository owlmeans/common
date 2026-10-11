import { STANDARD_MARKETING_CONSENTS, STANDARD_REVISION } from './consts.js'
import type {
  MarketingConsentConfig, MarketingConsentDecision, MarketingConsentDefinition,
  MarketingConsentStatusItem, MarketingConsentStatusOptions, MarketingConsentStatusView,
} from './types.js'
import type { MarketingConsentHelper } from './resolve/types.js'

export const createMarketingConsentHelper = (): MarketingConsentHelper => {
  const resolveMarketingConsents = (cfg?: MarketingConsentConfig): MarketingConsentDefinition[] => {
    const revisedAt = cfg?.revisedAt ?? STANDARD_REVISION
    const byKey = new Map<string, MarketingConsentDefinition>()

    STANDARD_MARKETING_CONSENTS.forEach(definition => {
      const override = cfg?.standard?.[definition.key]
      if (override === false) {
        return
      }
      byKey.set(definition.key, override == null
        ? { ...definition }
        : { ...definition, ...override, key: definition.key, group: definition.group })
    })

    cfg?.custom?.forEach(entry => {
      const existing = byKey.get(entry.key)
      const base: MarketingConsentDefinition = existing ?? {
        key: entry.key,
        group: entry.group,
        mode: 'opt-in',
        enabled: true,
        revisedAt,
      }
      byKey.set(entry.key, { ...base, ...entry })
    })

    if (cfg?.links != null) {
      Object.entries(cfg.links).forEach(([key, links]) => {
        const definition = byKey.get(key)
        if (definition == null || links.length === 0) {
          return
        }
        const seen = new Set<string>()
        const merged = [...(definition.links ?? []), ...links].filter(link => {
          if (seen.has(link.href)) {
            return false
          }
          seen.add(link.href)
          return true
        })
        byKey.set(key, { ...definition, links: merged })
      })
    }

    return Array.from(byKey.values())
      .filter(definition => definition.enabled !== false)
      .sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000))
  }

  const consentStatus = (
    defs: MarketingConsentDefinition[],
    decisions: MarketingConsentDecision[],
    opts?: MarketingConsentStatusOptions,
  ): MarketingConsentStatusView => {
    const latestByKey = new Map<string, MarketingConsentDecision>()
    decisions.forEach(decision => {
      const current = latestByKey.get(decision.key)
      if (current == null || decision.decidedAt > current.decidedAt) {
        latestByKey.set(decision.key, decision)
      }
    })

    const hasHistory = decisions.length > 0
    const gpc = opts?.gpc ?? false

    const items: MarketingConsentStatusItem[] = defs.map(definition => {
      const saved = latestByKey.get(definition.key)
      const suppressedByGpc = definition.honorGpc === true && gpc

      if (saved == null) {
        const granted = definition.mode === 'opt-out' && !suppressedByGpc
        return { definition, status: 'new', granted, updated: hasHistory }
      }

      const revised = saved.revisedAt !== definition.revisedAt || saved.mode !== definition.mode
      if (!revised) {
        return { definition, status: 'current', granted: saved.granted, updated: false, saved }
      }

      const granted = definition.mode === 'opt-in' ? false : (suppressedByGpc ? false : saved.granted)
      return { definition, status: 'revised', granted, updated: true, saved }
    })

    const view: MarketingConsentStatusView = {
      pending: items.some(item => item.status !== 'current'),
      items,
    }

    if (opts?.termsAcceptedAt != null) {
      view.terms = { version: opts.termsVersion ?? '', acceptedAt: opts.termsAcceptedAt }
    }

    return view
  }

  return { resolveMarketingConsents, consentStatus }
}

export const marketingConsentHelper = createMarketingConsentHelper()

/** @deprecated compat:factory-refactor — use `marketingConsentHelper.resolveMarketingConsents(…)` */
export const resolveMarketingConsents = (cfg?: MarketingConsentConfig): MarketingConsentDefinition[] =>
  marketingConsentHelper.resolveMarketingConsents(cfg)
