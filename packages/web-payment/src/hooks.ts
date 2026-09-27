import { useCallback, useState } from 'react'
import type { CallArguments, RegisteredEntrypoint, RequestShape } from '@owlmeans/entrypoint'
import { usePolled } from './poll.js'
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
): T | null => usePolled(() => entry.call(), intervalMs, deps)
