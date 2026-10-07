import { useCallback, useEffect, useMemo, useState } from 'react'
import { useContext } from '@owlmeans/client'
import { type LoginContext, loginTermsHelper } from '@owlmeans/client-auth/login'
import type { CommonConfig } from '@owlmeans/config'
import type { MarketingConsentStatusItem } from '@owlmeans/marketing-consent'
import { MARKETING_CONSENT_CLIENT_SERVICE } from '../consts.js'
import { marketingConsentSkipOf } from '../skip.js'
import type { MarketingConsentClientService } from '../types.js'
import { GROUP_ORDER, LOAD_TIMEOUT } from './consts.local.js'
import type { MarketingConsentGroup, UseMarketingConsentModel, UseMarketingConsentOptions } from './types.js'

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
 * (`'sign-in'` from the screen, `'settings'` from preferences — the default); the Terms
 * confirmation is computed only for `'sign-in'`, and only once `termsDeferred` — preferences never
 * shows it and never records it, whatever the application's `appendMarketingConsent({ terms })`.
 *
 * **Which items load also depends on `opts.source`, and this is the one place the two hosts
 * deliberately differ.** The sign-in step is a "ask only what's outstanding" gate: it loads items
 * only while `status.pending === true`, and shows nothing once everything is decided, so it never
 * re-asks a settled choice. `MarketingConsentPreferences` is a standing settings card, not a gate —
 * "changeable at any time" means every catalogue item is loaded UNCONDITIONALLY, whether or not
 * anything is currently pending, or a fully-decided account would render an empty card with
 * nothing left to revisit or withdraw.
 */
export const useMarketingConsent = (opts?: UseMarketingConsentOptions): UseMarketingConsentModel => {
  const context = useContext()
  const loginContext = context as unknown as LoginContext
  const client = context.service<MarketingConsentClientService>(MARKETING_CONSENT_CLIENT_SERVICE)
  const bulkSelection = client.bulkSelection ?? 'all'

  const signIn = opts?.source === 'sign-in'
  const deferred = signIn && loginTermsHelper.termsDeferred(loginContext)
  // Resolved whenever this is the sign-in screen, REGARDLESS of `deferred` — the privacy notice
  // (`terms.notices`) renders on this screen in every mode; only the consented part (`documents`/
  // `needed`/`ticked`) is specific to Terms mode, gated separately below.
  const resolved = useMemo(
    () => signIn
      ? loginTermsHelper.resolveTerms((loginContext.cfg as CommonConfig).security?.auth?.login?.terms)
      : null,
    [signIn, loginContext],
  )

  const [loading, setLoading] = useState(true)
  const [unreadable, setUnreadable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [termsError, setTermsError] = useState<string | null>(null)
  const [items, setItems] = useState<MarketingConsentStatusItem[]>([])
  const [draft, setDraft] = useState<Record<string, boolean>>({})
  const [gpc] = useState(readGpc)
  const [statusTermsVersion, setStatusTermsVersion] = useState<string | undefined>(undefined)
  const [termsTicked, setTermsTicked] = useState(false)
  const [termsAttempted, setTermsAttempted] = useState(false)
  const [pristine, setPristine] = useState(true)

  useEffect(() => {
    let cancelled = false
    let settled = false
    // Fires only if the status call is still outstanding at the budget — cleared the moment it
    // answers either way, so a fast, ordinary load never shows a flash of "unreadable".
    const timer = setTimeout(() => {
      if (cancelled || settled) {
        return
      }
      settled = true
      setItems([])
      setDraft({})
      setStatusTermsVersion(undefined)
      setUnreadable(true)
      setLoading(false)
    }, LOAD_TIMEOUT)

    void (async () => {
      const status = await client.status({ fresh: true })
      if (cancelled || settled) {
        return
      }
      settled = true
      clearTimeout(timer)

      // The sign-in step shows only items that actually need an answer — a status whose `pending`
      // already reads false (a race with another tab, most commonly) must not draw items nobody
      // has to decide on again. The settings card shows the WHOLE catalogue regardless: it is a
      // standing "change these at any time" surface, not a step, and gating it on `pending` the
      // same way would render it empty the moment every item happens to already be decided.
      const loaded = signIn ? (status?.pending === true ? status.items : []) : (status?.items ?? [])
      setItems(loaded)
      setDraft(Object.fromEntries(loaded.map(item => [item.definition.key, item.granted])))
      setStatusTermsVersion(status?.terms?.version)
      setUnreadable(status == null)
      setLoading(false)
    })()

    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  const liveItems = useMemo(
    () => items.map(item => ({ ...item, granted: draft[item.definition.key] ?? item.granted })),
    [items, draft],
  )
  const groups = useMemo(() => groupOf(liveItems), [liveItems])

  // Unreadable counts as "still needs the confirmation" — the one place this step is STRICT
  // rather than fail-open: a broken read must show the Terms box, never wave it through.
  const termsNeeded = deferred && resolved != null && (unreadable || statusTermsVersion !== resolved.version)
  const optionalOnly = !termsNeeded && items.length > 0

  // A host can restrict this control to required agreements. Optional choices then contribute
  // neither to its state nor to its action, even if the person has selected one individually.
  const rows = (bulkSelection === 'all' ? items.length : 0) + (termsNeeded ? 1 : 0)
  const ticked = (bulkSelection === 'all' ? items.filter(item => draft[item.definition.key] === true).length : 0)
    + (termsNeeded && termsTicked ? 1 : 0)
  const allChecked = rows > 0 && ticked === rows
  const allIndeterminate = ticked > 0 && ticked < rows

  const toggle = useCallback((key: string, checked: boolean) => {
    setDraft(current => ({ ...current, [key]: checked }))
    setPristine(false)
  }, [])

  const toggleAll = useCallback((checked: boolean) => {
    if (bulkSelection === 'all') {
      setDraft(Object.fromEntries(items.map(item => [item.definition.key, checked])))
    }
    if (termsNeeded) {
      setTermsTicked(checked)
      setTermsAttempted(false)
    }
    setPristine(false)
  }, [items, termsNeeded, bulkSelection])

  const tick = useCallback((value: boolean) => {
    setTermsTicked(value)
    setTermsAttempted(false)
    setPristine(false)
  }, [])

  const save = useCallback(async (): Promise<boolean> => {
    if (termsNeeded && !termsTicked) {
      // Guard only — a screen blocks the confirm control itself while this holds, so an ordinary
      // click never reaches here. A caller that calls `save()` directly still gets the same
      // "nothing happened, here is why" answer the blocked control would have shown.
      setTermsAttempted(true)

      return false
    }

    setSaving(true)
    setError(null)
    setTermsError(null)

    if (termsNeeded && resolved != null) {
      const recorded = await client.recordTerms(loginTermsHelper.termsAcceptanceOf(resolved, opts?.locale))
      if (!recorded) {
        setSaving(false)
        setTermsError('terms-failed')

        return false
      }
      // Optimistic: the server just accepted exactly this version — reflecting it locally avoids
      // an extra round trip and keeps `terms.needed` correct for the rest of this render.
      setStatusTermsVersion(resolved.version)
    }

    if (items.length < 1) {
      setSaving(false)

      return true
    }

    const result = await client.save({
      decisions: items.map(item => ({ key: item.definition.key, granted: draft[item.definition.key] === true })),
      source: opts?.source ?? 'settings',
      locale: opts?.locale,
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
  }, [client, items, draft, opts?.source, opts?.locale, gpc, termsNeeded, termsTicked, resolved])

  const skip = useCallback(async (): Promise<void> => {
    setError(null)
    setTermsError(null)
    await marketingConsentSkipOf(loginContext).markSkipped()
  }, [loginContext])

  return {
    loading, unreadable, saving, error, termsError, gpc, groups, bulkSelection, allChecked, allIndeterminate,
    toggleAll, toggle, pristine, optionalOnly, deferred,
    terms: {
      needed: termsNeeded,
      ticked: termsTicked,
      attempted: termsAttempted,
      tick,
      documents: resolved?.documents ?? [],
      notices: resolved?.notices ?? [],
      ...(resolved?.revisedAt != null ? { revisedAt: resolved.revisedAt } : {}),
      version: resolved?.version ?? '',
    },
    save,
    skip,
  }
}
