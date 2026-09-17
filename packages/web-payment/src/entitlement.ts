import { useCallback, useMemo, useState } from 'react'
import type { CallArguments, RegisteredEntrypoint, RequestShape } from '@owlmeans/entrypoint'
import { limitOf, reviveEntitlementView } from '@owlmeans/payment'
import type { EntitlementView, PortalFlow, PortalLinkResponse } from '@owlmeans/payment'
import { usePolled } from './poll.js'
import { capabilityStateOf, limitStatusOf } from './selectors.js'
import { openCheckout, type CheckoutTarget } from './service.js'
import type { LimitStatus, PortalArguments, PortalRequest } from './types.js'

/**
 * Poll an entitlement-view protocol — `null` until the first answer. The view is revived on the way
 * in (the wire carries ISO strings), so every date in it is a `Date`.
 *
 * An application that already keeps the view in its own store reads it through the pure selectors
 * (`capabilityStateOf`, `limitStatusOf`, `planStatusLineOf`) instead of polling a second time.
 */
export const useEntitlementView = <Request extends RequestShape>(
  entry: RegisteredEntrypoint<Request, EntitlementView>,
  intervalMs: number = 60_000,
  deps: unknown[] = [],
  ...request: CallArguments<Request>
): EntitlementView | null => usePolled(
  async () => reviveEntitlementView(await entry.call(...request)), intervalMs, deps,
)

/** Whether the view grants a capability parameter; `null` while the view is unknown. */
export const useCapability = (view: EntitlementView | null | undefined, param: string): boolean | null =>
  useMemo(() => capabilityStateOf(view, param), [view, param])

/** One limit of the view with `exhausted` and `ratio`; `null` while unknown or undeclared. */
export const useLimit = (view: EntitlementView | null | undefined, key: string): LimitStatus | null =>
  useMemo(() => limitStatusOf(limitOf(view, key)), [view, key])

/**
 * Open a billing-portal flow: `portal(entry, request?)` calls the portal protocol with `body.flow`
 * set to `flow`, then sends the browser to the returned URL (same window by default). Without a DOM
 * the navigation is inert and the response is still returned.
 */
export const usePortal = (flow: PortalFlow, target: CheckoutTarget = '_self') => {
  const [pending, setPending] = useState(false)
  const portal = useCallback(async <Request extends PortalRequest>(
    entry: RegisteredEntrypoint<Request, PortalLinkResponse>, ...request: PortalArguments<Request>
  ): Promise<PortalLinkResponse | null> => {
    setPending(true)
    try {
      const [options] = request as [{ body?: object }?]
      // The flow completes the body the caller's arguments deliberately leave out.
      const args = [{ ...options, body: { ...options?.body, flow } }] as unknown as CallArguments<Request>
      const result: PortalLinkResponse | undefined = await entry.call(...args)
      if (result?.url != null) openCheckout(result.url, target)
      return result ?? null
    } finally { setPending(false) }
  }, [flow, target])

  return { portal, pending }
}
