import { useCallback, useEffect, useRef, useState } from 'react'
import type { CallArguments, RegisteredEntrypoint, RequestShape } from '@owlmeans/entrypoint'
import { hasEntitlement } from '@owlmeans/payment'
import { openCheckout, type CheckoutTarget } from './service.js'
import type { CheckoutResult } from './types.js'

export const useCheckout = (target: CheckoutTarget = '_self') => {
  const [pending, setPending] = useState(false)
  const checkout = useCallback(async <Request extends RequestShape>(
    entry: RegisteredEntrypoint<Request, CheckoutResult>, ...request: CallArguments<Request>
  ): Promise<CheckoutResult | null> => {
    setPending(true)
    try {
      const result = await entry.call(...request)
      if (result?.url != null) openCheckout(result.url, target)
      return result ?? null
    } finally { setPending(false) }
  }, [target])
  return { checkout, pending }
}

export const usePaymentBalance = <T>(
  entry: RegisteredEntrypoint<{}, T>, intervalMs: number = 60_000, deps: unknown[] = [],
): T | null => {
  const [balance, setBalance] = useState<T | null>(null)
  const entryRef = useRef(entry)
  entryRef.current = entry
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const value = await entryRef.current.call()
        if (active) setBalance(value)
      } catch { /* explicit actions own their errors */ }
    }
    void load()
    const ticker = setInterval(load, intervalMs)
    return () => { active = false; clearInterval(ticker) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps])
  return balance
}

export const useEntitlements = <T extends { entitlements?: string[] }>(
  entry: RegisteredEntrypoint<{}, T>, intervalMs: number = 60_000, deps: unknown[] = [],
): string[] | null => usePaymentBalance(entry, intervalMs, deps)?.entitlements ?? null

export const useEntitlement = (list: string[] | null, param: string): boolean => list != null && hasEntitlement(
  list.map(item => {
    const colon = item.indexOf(':')
    return colon >= 0
      ? { scope: item.slice(0, colon), permissions: { [item.slice(colon + 1)]: true } }
      : { scope: '', permissions: { [item]: true } }
  }),
  param,
)
