import { useCallback, useEffect, useMemo, useState } from 'react'
import { useContext } from '@owlmeans/client'
import { MC_GROUP_COMMUNICATIONS, MC_GROUP_DATA, MC_GROUP_TRACKERS } from '@owlmeans/marketing-consent'
import type { MarketingConsentStatusItem } from '@owlmeans/marketing-consent'
import { MARKETING_CONSENT_CLIENT_SERVICE } from '../consts.js'
import type { MarketingConsentClientService } from '../service.js'

export interface MarketingConsentGroup {
  key: string
  titleKey: string
  descriptionKey: string
  items: MarketingConsentStatusItem[]
}

export interface UseMarketingConsentModel {
  loading: boolean
  saving: boolean
  /** Non-null after a failed `save()` — a fixed marker, not the wire text; the screen renders one
   * translated sentence (`screen.error`/`preferences.error`) regardless of its value. */
  error: string | null
  /** `navigator.globalPrivacyControl === true`, read once at mount. */
  gpc: boolean
  /** Grouped in the standard order (communications, data, trackers), any other group appended
   * after in first-seen order. Each item's `granted` reflects the CURRENT draft, not the value the
   * status call first loaded — a consumer never reads draft state separately. */
  groups: MarketingConsentGroup[]
  allChecked: boolean
  allIndeterminate: boolean
  toggleAll: (checked: boolean) => void
  toggle: (key: string, checked: boolean) => void
  /** Posts every item's CURRENT draft value (never only the changed ones — the server upserts by
   * key). Resolves `true` on success, `false` on failure (and sets {@link error}). */
  save: () => Promise<boolean>
  /** Clears {@link error} — what "Continue without saving" calls before moving the flow on. */
  skip: () => void
}

const GROUP_ORDER = [MC_GROUP_COMMUNICATIONS, MC_GROUP_DATA, MC_GROUP_TRACKERS]

const groupRank = (key: string): number => {
  const index = GROUP_ORDER.indexOf(key)

  return index >= 0 ? index : GROUP_ORDER.length
}

const groupOf = (items: MarketingConsentStatusItem[]): MarketingConsentGroup[] => {
  const order: string[] = []
  const byKey = new Map<string, MarketingConsentStatusItem[]>()
  for (const item of items) {
    const key = item.definition.group
    if (!byKey.has(key)) {
      order.push(key)
      byKey.set(key, [])
    }
    byKey.get(key)!.push(item)
  }

  return order
    .sort((a, b) => groupRank(a) - groupRank(b))
    .map(key => ({
      key, titleKey: `group.${key}.title`, descriptionKey: `group.${key}.description`,
      items: byKey.get(key)!,
    }))
}

const readGpc = (): boolean => {
  try {
    return typeof navigator !== 'undefined'
      && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  } catch {
    return false
  }
}

/**
 * Headless model behind the sign-in screen AND `MarketingConsentPreferences` — the same body,
 * driven the same way, so the two never drift. `opts.source` is what a successful `save()` posts
 * (`'sign-in'` from the screen, `'settings'` from preferences — the default).
 */
export const useMarketingConsent = (opts?: { source?: 'sign-in' | 'settings' }): UseMarketingConsentModel => {
  const context = useContext()
  const client = context.service<MarketingConsentClientService>(MARKETING_CONSENT_CLIENT_SERVICE)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<MarketingConsentStatusItem[]>([])
  const [draft, setDraft] = useState<Record<string, boolean>>({})
  const [gpc] = useState(readGpc)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const status = await client.status({ fresh: true })
      if (cancelled) {
        return
      }
      const loaded = status?.items ?? []
      setItems(loaded)
      setDraft(Object.fromEntries(loaded.map(item => [item.definition.key, item.granted])))
      setLoading(false)
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  const liveItems = useMemo(
    () => items.map(item => ({ ...item, granted: draft[item.definition.key] ?? item.granted })),
    [items, draft],
  )
  const groups = useMemo(() => groupOf(liveItems), [liveItems])

  const allChecked = items.length > 0 && items.every(item => draft[item.definition.key] === true)
  const allIndeterminate = !allChecked && items.some(item => draft[item.definition.key] === true)

  const toggle = useCallback((key: string, checked: boolean) => {
    setDraft(current => ({ ...current, [key]: checked }))
  }, [])

  const toggleAll = useCallback((checked: boolean) => {
    setDraft(Object.fromEntries(items.map(item => [item.definition.key, checked])))
  }, [items])

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true)
    setError(null)
    const result = await client.save({
      decisions: items.map(item => ({ key: item.definition.key, granted: draft[item.definition.key] === true })),
      source: opts?.source ?? 'settings',
      gpc,
    })
    setSaving(false)

    if (result == null) {
      setError('save-failed')

      return false
    }

    setItems(result.items)
    setDraft(Object.fromEntries(result.items.map(item => [item.definition.key, item.granted])))

    return true
  }, [client, items, draft, opts?.source, gpc])

  const skip = useCallback(() => { setError(null) }, [])

  return { loading, saving, error, gpc, groups, allChecked, allIndeterminate, toggleAll, toggle, save, skip }
}
