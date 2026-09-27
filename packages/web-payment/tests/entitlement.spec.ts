import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RegisteredEntrypoint } from '@owlmeans/entrypoint'
import {
  LimitKind, LimitWindow, PortalFlow, SubscriptionStatus, entitlementViewOf,
  type EntitlementPlanView, type EntitlementView, type LimitView, type PortalLinkBody,
  type PortalLinkResponse, type ProductPlan,
} from '@owlmeans/payment'
import { useCapability, useLimit, usePortal } from '../src/entitlement.js'
import { limitStatusOf, planStatusLineOf } from '../src/selectors.js'

const AT = new Date('2026-09-16T12:00:00Z')

const planView: EntitlementPlanView = {
  sku: 'pro-monthly', productSku: 'pro', title: 'Pro', rank: 10, free: false,
  status: SubscriptionStatus.Active, paygate: 'stripe', subscribedAt: new Date('2026-01-01T00:00:00Z'),
}

const view: EntitlementView = entitlementViewOf({
  capabilities: [
    { scope: 'feature', permissions: { whitelabel: true } },
    { scope: 'feature', permissions: { beta: true }, promo: { until: new Date('2026-09-01T00:00:00Z') } },
  ],
  limits: { seats: { kind: LimitKind.Window, window: LimitWindow.Month, limit: 5 } },
} as unknown as ProductPlan, planView, [{ key: 'seats', window: '2026-09', used: 3 }], AT)

/** Render hooks once on the server and hand back what they answered. */
const answer = <T>(hook: () => T): T => {
  let value: T | undefined
  const Probe = () => { value = hook(); return null }
  renderToStaticMarkup(createElement(Probe))
  return value as T
}

const row = (limit: number, used: number): LimitView => ({
  key: 'seats', param: 'limit:seats', kind: LimitKind.Lifetime, limit, used, remaining: Math.max(0, limit - used),
})

describe('entitlement hooks — null means unknown', () => {
  test('answer null for a view that is not known yet, and the view otherwise', () => {
    expect(answer(() => useCapability(null, 'feature:whitelabel'))).toBeNull()
    expect(answer(() => useLimit(undefined, 'seats'))).toBeNull()
    expect(answer(() => useCapability(view, 'feature:whitelabel'))).toBe(true)
    // A lapsed promo is listed but not granted; an undeclared key has no row.
    expect(answer(() => useCapability(view, 'feature:beta'))).toBe(false)
    expect(answer(() => useLimit(view, 'unknown'))).toBeNull()
    expect(answer(() => useLimit(view, 'seats'))).toMatchObject({ used: 3, limit: 5, remaining: 2, exhausted: false })
  })
})

describe('limitStatusOf', () => {
  test('clamps the ratio to [0, 1] and flags exhaustion', () => {
    expect(limitStatusOf(row(5, 3))).toMatchObject({ ratio: 0.6, exhausted: false })
    expect(limitStatusOf(row(5, 5))).toMatchObject({ ratio: 1, exhausted: true })
    expect(limitStatusOf({ ...row(2, 3), remaining: 0 })).toMatchObject({ ratio: 1, exhausted: true })
    expect(limitStatusOf({ ...row(5, -1), remaining: 5 })).toMatchObject({ ratio: 0, exhausted: false })
  })

  test('reads a limit that is not included as empty and exhausted', () => {
    expect(limitStatusOf(row(0, 0))).toMatchObject({ ratio: 0, exhausted: true })
    expect(limitStatusOf(row(0, 1))).toMatchObject({ ratio: 1, exhausted: true })
    expect(limitStatusOf(null)).toBeNull()
  })
})

describe('planStatusLineOf', () => {
  test('picks the first matching line and the date it names', () => {
    const periodEnd = new Date('2026-10-16T00:00:00Z')
    expect(planStatusLineOf({ ...planView, periodEnd })).toEqual({ kind: 'renews', tone: 'ok', date: periodEnd })
    expect(planStatusLineOf({ ...planView, periodEnd, cancelAtPeriodEnd: true }).kind).toBe('cancel-scheduled')
    expect(planStatusLineOf({ ...planView, status: SubscriptionStatus.PastDue, pastDue: true, cancelAtPeriodEnd: true }).kind)
      .toBe('past-due')
    expect(planStatusLineOf({ ...planView, status: SubscriptionStatus.Suspended }).kind).toBe('suspended')
    // A wire view whose dates were never revived still names its date.
    expect(planStatusLineOf({ ...planView, status: SubscriptionStatus.Suspended, pausedAt: '2026-09-01T00:00:00Z' as never }))
      .toEqual({ kind: 'paused', tone: 'warning', date: new Date('2026-09-01T00:00:00Z') })
    expect(planStatusLineOf({ ...planView, free: true, periodEnd }).kind).toBe('free')
    expect(planStatusLineOf({ ...planView, status: SubscriptionStatus.Canceled, periodEnd }).kind).toBe('canceled')
  })
})

describe('usePortal', () => {
  const entry = (calls: unknown[], url = 'https://billing.example/session') => ({
    call: async (request: unknown) => { calls.push(request); return { url } },
  }) as unknown as RegisteredEntrypoint<{ body: PortalLinkBody }, PortalLinkResponse>

  test('calls the protocol with its flow and is inert without a DOM', async () => {
    expect(typeof window).toBe('undefined')
    const calls: unknown[] = []
    const { portal, pending } = answer(() => usePortal(PortalFlow.Change))
    expect(pending).toBe(false)
    const result = await portal(entry(calls), { body: { planSku: 'pro-yearly' } })
    expect(result).toEqual({ url: 'https://billing.example/session' })
    expect(calls).toEqual([{ body: { planSku: 'pro-yearly', flow: PortalFlow.Change } }])
  })

  test('sends the browser to the portal in the same window by default', async () => {
    const assigned: string[] = []
    const opened: unknown[][] = []
    const previous = globalThis.window
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { assign: (url: string) => assigned.push(url) }, open: (...args: unknown[]) => opened.push(args) },
    })
    try {
      const calls: unknown[] = []
      await answer(() => usePortal(PortalFlow.Manage)).portal(entry(calls))
      await answer(() => usePortal(PortalFlow.Cancel, '_blank')).portal(entry(calls, 'https://billing.example/cancel'))
      expect(calls).toEqual([{ body: { flow: PortalFlow.Manage } }, { body: { flow: PortalFlow.Cancel } }])
      expect(assigned).toEqual(['https://billing.example/session'])
      expect(opened).toEqual([['https://billing.example/cancel', '_blank', 'noopener,noreferrer']])
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: previous })
    }
  })
})
