import { useState } from 'react'
import type { RegisteredEntrypoint } from '@owlmeans/entrypoint'
import {
  LimitKind, LimitWindow, SubscriptionStatus, TaxBehavior, TaxEstimateStatus, TaxType,
  capabilityViewsOf, entitlementViewOf, limitViewsOf,
  type EntitlementPlanView, type EntitlementView, type PlanCapability, type LimitDeclaration,
  type PriceEstimate, type ProductPlan,
} from '@owlmeans/payment'
import {
  CapabilityList, CountrySelect, LimitMeter, PlanCard, PriceEstimateAmount, useCapability,
  useEntitlementView, useLimit, usePriceEstimate,
} from '../../src/index.js'

const AT = new Date('2026-09-16T12:00:00Z')
const SUBSCRIBED = new Date('2026-01-01T00:00:00Z')
const PROMO_UNTIL = new Date('2026-12-31T00:00:00Z')

const pro: EntitlementPlanView = {
  sku: 'pro-monthly', productSku: 'pro', title: 'Pro', rank: 10, free: false,
  status: SubscriptionStatus.Active, paygate: 'stripe', subscribedAt: SUBSCRIBED,
}
const free: EntitlementPlanView = {
  sku: 'free-plan', productSku: 'pro', title: 'Free', rank: 0, free: true,
  status: SubscriptionStatus.Active, paygate: 'internal',
}

const PLANS: Record<string, EntitlementPlanView> = {
  renews: { ...pro, periodEnd: new Date('2026-10-16T00:00:00Z') },
  trial: { ...pro, status: SubscriptionStatus.Trial, trialEnd: new Date('2026-09-30T00:00:00Z') },
  'past-due': { ...pro, status: SubscriptionStatus.PastDue, pastDue: true, periodEnd: new Date('2026-10-16T00:00:00Z') },
  'cancel-scheduled': { ...pro, cancelAtPeriodEnd: true, periodEnd: new Date('2026-10-16T00:00:00Z') },
  paused: { ...pro, status: SubscriptionStatus.Suspended, pausedAt: new Date('2026-09-01T00:00:00Z') },
  free,
  active: pro,
}

const capabilities: PlanCapability[] = [
  { scope: 'feature', permissions: { whitelabel: true, 'custom-domain': true } },
  { scope: 'feature', permissions: { 'local-llm': true }, promo: { until: PROMO_UNTIL } },
  { scope: 'feature', permissions: { conversions: true }, promo: { until: PROMO_UNTIL, grandfather: true } },
  { scope: 'feature', permissions: { beta: true }, promo: { until: new Date('2026-09-01T00:00:00Z') } },
]

const limits: Record<string, LimitDeclaration> = {
  seats: { kind: LimitKind.Window, window: LimitWindow.Month, limit: 5 },
  exports: { kind: LimitKind.Window, window: LimitWindow.Day, limit: 2 },
  projects: { kind: LimitKind.Lifetime, limit: 0 },
  sites: { kind: LimitKind.Occupancy, limit: 3, promo: { until: PROMO_UNTIL } },
}

const usage = [
  { key: 'seats', window: '2026-09', used: 3 },
  { key: 'exports', window: '2026-09-16', used: 2 },
  { key: 'sites', window: 'occupancy', used: 1 },
]

const LABELS: Record<string, string> = {
  'feature:whitelabel': 'White label',
  'feature:local-llm': 'Local models',
  'feature:conversions': 'Conversions',
  'feature:beta': 'Beta programme',
}

const Pieces = () => {
  const [acted, setActed] = useState('')
  const capabilityRows = capabilityViewsOf({ capabilities }, SUBSCRIBED, AT)
  const limitRows = limitViewsOf({ limits }, usage, SUBSCRIBED, AT)
  const label = (key: string) => `${key[0].toUpperCase()}${key.slice(1)}`

  return <main className="grid gap-6 p-6">
    <section data-case="plans" className="grid gap-4">
      {Object.entries(PLANS).map(([name, plan]) => <div key={name} data-case={name}><PlanCard plan={plan} /></div>)}
    </section>
    <section data-case="offers" className="grid gap-4">
      <div data-case="offer-current">
        <PlanCard plan={free} offer={{ sku: 'free-plan', title: 'Free', priceLabel: '$0' }} actionLabel="Manage" onAction={setActed} />
      </div>
      <div data-case="offer-upgrade">
        <PlanCard plan={free} offer={{ sku: 'pro-monthly', title: 'Pro', priceLabel: '$20 / month', highlight: true }}
          actionLabel="Upgrade" onAction={setActed}>
          <p>Everything in Free, and more.</p>
        </PlanCard>
      </div>
      <div data-case="offer-pending">
        <PlanCard plan={free} offer={{ sku: 'pro-monthly', title: 'Pro', priceLabel: '$20 / month' }}
          actionLabel="Upgrade" onAction={setActed} pending />
      </div>
      <output id="acted">{acted}</output>
    </section>
    <section data-case="limits" className="grid gap-4">
      {limitRows.map(limit => <LimitMeter key={limit.key} limit={limit} label={label(limit.key)} />)}
      <div data-case="no-reset"><LimitMeter limit={limitRows[0]} label="Seats" showReset={false} compact /></div>
    </section>
    <section data-case="capabilities"><CapabilityList capabilities={capabilityRows} labels={LABELS} /></section>
    <section data-case="only-granted"><CapabilityList capabilities={capabilityRows} labels={LABELS} onlyGranted /></section>
  </main>
}

/** What a server answers: the view through JSON, every date an ISO string. */
const wireView = JSON.parse(JSON.stringify(entitlementViewOf(
  { capabilities, limits } as unknown as ProductPlan, PLANS.renews, usage, AT,
))) as EntitlementView

const HookView = () => {
  const [entry] = useState(() => ({
    call: async () => {
      await new Promise(resolve => setTimeout(resolve, 800))
      return wireView
    },
  }) as unknown as RegisteredEntrypoint<{}, EntitlementView>)
  const view = useEntitlementView(entry)
  const whitelabel = useCapability(view, 'feature:whitelabel')
  const seats = useLimit(view, 'seats')

  return <main className="grid gap-4 p-6">
    <output id="capability">{String(whitelabel)}</output>
    <output id="seats">{seats == null ? 'null' : `${seats.used}/${seats.limit}:${seats.ratio}`}</output>
    {view != null && <PlanCard plan={view.plan} />}
    {view != null && view.limits.map(limit => <LimitMeter key={limit.key} limit={limit} label={limit.key} />)}
  </main>
}

const PLAN_SUBTOTAL: Record<string, number> = { 'pro-monthly': 2_000, 'team-monthly': 5_000 }

/** A fake `account.priceEstimate` that actually varies with the body it's called with. */
const fakeEstimateEntry = () => ({
  call: async ({ body }: { body?: { planSku?: string, country?: string } }) => {
    await new Promise(resolve => setTimeout(resolve, 50))
    const subtotalMinor = PLAN_SUBTOTAL[body?.planSku ?? ''] ?? 1_000
    const country = body?.country
    const tax: PriceEstimate['tax'] = country == null
      ? { status: TaxEstimateStatus.LocationRequired, subtotalMinor, taxMinor: 0, totalMinor: subtotalMinor, scalable: false, rates: [] }
      : country === 'PL'
        ? {
          status: TaxEstimateStatus.Taxed, subtotalMinor, taxMinor: Math.round(subtotalMinor * 0.23),
          totalMinor: subtotalMinor + Math.round(subtotalMinor * 0.23), scalable: true,
          rates: [{ type: TaxType.Vat, percentage: '23', ratePpm: 230_000, country: 'PL' }],
        }
        : { status: TaxEstimateStatus.None, subtotalMinor, taxMinor: 0, totalMinor: subtotalMinor, scalable: true, rates: [] }
    return { country, source: 'request', currency: 'usd', behavior: TaxBehavior.Exclusive, tax } satisfies PriceEstimate
  },
}) as unknown as RegisteredEntrypoint<{ body?: { planSku?: string, country?: string } }, PriceEstimate>

/** One `CountrySelect` driving two independent, controlled `usePriceEstimate` calls. */
const SharedEstimateCase = () => {
  const [entry] = useState(fakeEstimateEntry)
  const [country, setCountry] = useState('')
  const pro = usePriceEstimate(entry, { enabled: true, country, onCountryChange: setCountry }, { body: { planSku: 'pro-monthly' } })
  const team = usePriceEstimate(entry, { enabled: true, country, onCountryChange: setCountry }, { body: { planSku: 'team-monthly' } })

  return <main className="grid gap-4 p-6">
    <CountrySelect value={country} onChange={setCountry} />
    <div data-case="pro"><PriceEstimateAmount control={pro} subtotalMinor={2_000} currency="usd" /></div>
    <div data-case="team"><PriceEstimateAmount control={team} subtotalMinor={5_000} currency="usd" /></div>
  </main>
}

export const EntitlementCase = ({ name }: { name: string }) =>
  name === 'hook' ? <HookView /> : name === 'shared-estimate' ? <SharedEstimateCase /> : <Pieces />
