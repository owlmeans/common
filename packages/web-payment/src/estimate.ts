import { useCallback, useEffect, useRef, useState } from 'react'
import type { RegisteredEntrypoint } from '@owlmeans/entrypoint'
import type { PriceEstimate } from '@owlmeans/payment'
import { EstimateCache } from './estimate-cache.js'
import type { PriceEstimateArguments, PriceEstimateControl, PriceEstimateRequest } from './types.js'

const DEFAULT_TTL_MS = 5 * 60_000

/** Shared across every mounted dialog/estimate card in the tab — the server already caches per TTL too. */
const cache = new EstimateCache<PriceEstimate>()

export interface UsePriceEstimateOptions {
  /** Fetch (and refetch on a country change) only while `true` — a closed dialog costs nothing. */
  enabled: boolean
  ttlMs?: number
  /**
   * Controls the country from outside (several estimates sharing one picker — a plan comparison
   * table). Given: the hook never owns `useState` for it, never preselects from `source:
   * 'customer'` (the owner does, once, for whichever estimate answers first), and the returned
   * control's `onCountryChange` calls this back instead of an internal setter. Absent (the
   * default): the hook is self-contained, exactly as a standalone dialog needs.
   */
  country?: string
  onCountryChange?: (country: string) => void
}

/**
 * A live `PriceEstimate` for one protocol/request, with a country the caller may change.
 *
 * Fetches once `enabled` and again on every `onCountryChange`, from a client-side cache keyed by
 * the entry's alias, the request body and the country — a TTL match answers instantly, an identical
 * in-flight request is shared. Uncontrolled (no `opts.country`): the first answer whose `source` is
 * `'customer'` preselects its `country`, once, so a returning buyer sees their own country without
 * picking it. Controlled (`opts.country` given): the country and its preselection are the caller's.
 *
 * An answer for a LOCKED billing country (`locked`, or `source: 'profile'`) wins over any pick: the
 * hook adopts its country (controlled: through `opts.onCountryChange`, once), returns `locked:
 * true`, and ignores `onCountryChange` from then on — the picker renders disabled.
 */
export const usePriceEstimate = <Request extends PriceEstimateRequest>(
  entry: RegisteredEntrypoint<Request, PriceEstimate>, opts: UsePriceEstimateOptions,
  ...request: PriceEstimateArguments<Request>
): PriceEstimateControl => {
  const entryRef = useRef(entry)
  entryRef.current = entry
  const base = (request[0] ?? {}) as { body?: Omit<Request['body'], 'country'> } & Record<string, unknown>
  const bodyKey = JSON.stringify(base.body ?? {})
  const controlled = opts.country !== undefined

  const [internalCountry, setInternalCountry] = useState('')
  const country = controlled ? opts.country! : internalCountry
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const preselectedRef = useRef(false)
  const lockedRef = useRef(false)
  const locked = estimate != null && isLockedAnswer(estimate)
  lockedRef.current = locked
  const onCountryChangeRef = useRef(opts.onCountryChange)
  onCountryChangeRef.current = opts.onCountryChange

  useEffect(() => {
    if (!opts.enabled) {
      return
    }
    let active = true
    const key = `${entryRef.current.alias}:${bodyKey}:${country}`
    const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
    setLoading(true)
    setFailed(false)
    cache.load(key, ttlMs, async () => await entryRef.current.call({
      ...base, body: { ...(base.body ?? {}), ...(country !== '' ? { country } : {}) },
    } as never)).then(result => {
      if (!active) return
      setEstimate(result)
      setLoading(false)
      if (isLockedAnswer(result) && result.country != null && result.country !== country) {
        // A locked billing country overrides whatever was picked: adopt it, once per country.
        preselectedRef.current = true
        if (controlled) {
          onCountryChangeRef.current?.(result.country)
        } else {
          setInternalCountry(result.country)
        }
        return
      }
      if (!controlled && !preselectedRef.current && country === '' && result.source === 'customer' && result.country != null) {
        preselectedRef.current = true
        setInternalCountry(result.country)
      }
    }).catch(() => {
      if (active) {
        setFailed(true)
        setLoading(false)
      }
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, opts.ttlMs, bodyKey, country])

  const onCountryChange = useCallback((next: string) => {
    if (lockedRef.current) {
      return
    }
    if (controlled) {
      opts.onCountryChange?.(next)
      return
    }
    preselectedRef.current = true
    setInternalCountry(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, opts.onCountryChange])

  return { estimate, country, loading, failed, locked, onCountryChange }
}

/** An answer computed for the entity's locked billing country, which no picker may change. */
export const isLockedAnswer = (estimate: PriceEstimate): boolean =>
  estimate.locked === true || estimate.source === 'profile'
