import { useCallback, useEffect, useMemo, useState } from 'react'
import { useContext } from '@owlmeans/client'
import { resolveTerms, termsAcceptanceOf, termsDeferred } from '@owlmeans/client-auth/login'
import type { LoginContext, ResolvedTermsDocument } from '@owlmeans/client-auth/login'
import type { CommonConfig } from '@owlmeans/config'
import { MC_GROUP_COMMUNICATIONS, MC_GROUP_DATA } from '@owlmeans/marketing-consent'
import type { MarketingConsentStatusItem } from '@owlmeans/marketing-consent'
import { MARKETING_CONSENT_CLIENT_SERVICE } from '../consts.js'
import { markMarketingConsentSkipped } from '../step.js'
import type { MarketingConsentClientService } from '../service.js'

export interface MarketingConsentGroup {
  key: string
  titleKey: string
  descriptionKey: string
  items: MarketingConsentStatusItem[]
}

/** The Terms confirmation, present only on the sign-in screen and only once `termsDeferred`. */
export interface MarketingConsentTermsModel {
  /** Still unconfirmed for the version this application currently configures. */
  needed: boolean
  ticked: boolean
  /** A blocked confirm was attempted — render the requirement sentence. */
  attempted: boolean
  tick: (value: boolean) => void
  /** What the checkbox agrees to — terms, then billing/product when configured, then custom. */
  documents: ResolvedTermsDocument[]
  /** What is merely disclosed, never consented to — privacy, plus cookies per its own rule. */
  notices: ResolvedTermsDocument[]
  /** The latest revision date among `documents`, only when the configuration asked to show it. */
  revisedAt?: string
  /** The digest acceptance is recorded against — changes whenever a document does. */
  version: string
}

export interface UseMarketingConsentModel {
  loading: boolean
  /**
   * The status could not be read at all (a network/auth failure), or the read has not answered
   * within the load budget. Distinct from `loading`: nobody is shown "Loading…" forever.
   */
  unreadable: boolean
  saving: boolean
  /** Non-null after a failed item `save()` — a fixed marker, not the wire text; the screen renders
   * one translated sentence (`screen.error`/`preferences.error`) regardless of its value. */
  error: string | null
  /** Non-null after a failed TERMS recording — distinct from `error`, which is the items' own. */
  termsError: string | null
  /** `navigator.globalPrivacyControl === true`, read once at mount. */
  gpc: boolean
  /** Grouped in the standard order (communications, data, trackers), any other group appended
   * after in first-seen order. Each item's `granted` reflects the CURRENT draft, not the value the
   * status call first loaded — a consumer never reads draft state separately. For `source:
   * 'sign-in'`, empty whenever nothing is currently pending — a step must not show items that need
   * no answer. For `source: 'settings'` (the default), this is the WHOLE catalogue, always — a
   * standing settings card lets a person revisit and change any decision, not only the ones
   * currently outstanding. */
  groups: MarketingConsentGroup[]
  allChecked: boolean
  allIndeterminate: boolean
  toggleAll: (checked: boolean) => void
  toggle: (key: string, checked: boolean) => void
  /**
   * False from the FIRST change the person makes this visit — a tick/untick of any item, or
   * ticking the Terms box. While true and only optional items are on screen, the confirm button is
   * still a valid, clickable action (saving exactly what is shown); it is styled muted and paired
   * with a hint rather than looking like an ordinary primary action.
   */
  pristine: boolean
  /** Only optional consents are on screen for this visit — no Terms box (`terms.needed` is
   * false) and at least one item is pending. Drives the muted-confirm/hint/Skip UI. */
  optionalOnly: boolean
  /**
   * This consumer registered the Terms confirmation on this screen (`appendMarketingConsent({
   * terms: 'step' })` + `termsDeferred`) — true even before the status load answers whether it is
   * CURRENTLY `terms.needed`, which is what a "Sign out" affordance shown while loading needs.
   */
  deferred: boolean
  terms: MarketingConsentTermsModel
  /**
   * Records the Terms acceptance first (only when `terms.needed`), then posts every LOADED item's
   * CURRENT draft value (never only the changed ones — the server upserts by key). For `source:
   * 'sign-in'` that is only the pending items, and is skipped entirely when none are; for `source:
   * 'settings'` it is the whole catalogue, so a save always reflects exactly what the card showed —
   * see `groups`. Resolves `true` only once everything due was recorded.
   */
  save: () => Promise<boolean>
  /**
   * Marks THIS sign-in as having skipped the step (so it is not asked again until the next one)
   * and clears `error`/`termsError` — the caller still has to move the flow on itself
   * (`useContinueLogin`). Never offered by a screen while `terms.needed` is true.
   */
  skip: () => Promise<void>
}

export interface UseMarketingConsentOptions {
  source?: 'sign-in' | 'settings'
  /** The UI's current language, sent alongside a recorded Terms acceptance. */
  locale?: string
}

const GROUP_ORDER = [MC_GROUP_COMMUNICATIONS, MC_GROUP_DATA]

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
 * How long the status load may take before the screen treats it as unreadable rather than show
 * "Loading…" forever — a broken network (or a broken server) must never trap a signed-in person
 * here silently.
 */
const LOAD_TIMEOUT = 10_000

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

  const signIn = opts?.source === 'sign-in'
  const deferred = signIn && termsDeferred(loginContext)
  // Resolved whenever this is the sign-in screen, REGARDLESS of `deferred` — the privacy notice
  // (`terms.notices`) renders on this screen in every mode; only the consented part (`documents`/
  // `needed`/`ticked`) is specific to Terms mode, gated separately below.
  const resolved = useMemo(
    () => signIn
      ? resolveTerms((loginContext.cfg as CommonConfig).security?.auth?.login?.terms)
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

  // Select-all speaks for every row on screen — the Terms row too while it is up. Ticking it is a
  // deliberate act on a control whose row sits right below it, exactly like ticking the row itself.
  const rows = items.length + (termsNeeded ? 1 : 0)
  const ticked = items.filter(item => draft[item.definition.key] === true).length + (termsNeeded && termsTicked ? 1 : 0)
  const allChecked = rows > 0 && ticked === rows
  const allIndeterminate = ticked > 0 && ticked < rows

  const toggle = useCallback((key: string, checked: boolean) => {
    setDraft(current => ({ ...current, [key]: checked }))
    setPristine(false)
  }, [])

  const toggleAll = useCallback((checked: boolean) => {
    setDraft(Object.fromEntries(items.map(item => [item.definition.key, checked])))
    if (termsNeeded) {
      setTermsTicked(checked)
      setTermsAttempted(false)
    }
    setPristine(false)
  }, [items, termsNeeded])

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
      const recorded = await client.recordTerms(termsAcceptanceOf(resolved, opts?.locale))
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
    await markMarketingConsentSkipped(loginContext)
  }, [loginContext])

  return {
    loading, unreadable, saving, error, termsError, gpc, groups, allChecked, allIndeterminate,
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
