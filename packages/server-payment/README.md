# @owlmeans/server-payment

Server-side payments for OwlMeans applications: a Stripe gateway embedded in the backend
(amount and quantity checkout, subscriptions, the customer portal), a subscription store that
understands the whole Stripe lifecycle, a usage ledger for counted plan limits, the entitlement
service that resolves what an organization entity may do, and the two gate services that refuse a
request before its handler runs. The contracts — plans, limits, promos, the entitlement view, the
refusal errors — live in `@owlmeans/payment`.

## Declare the catalogue

```typescript
import { CheckoutPricingMode, LimitKind, LimitWindow, PlanDuration, ProductType } from '@owlmeans/payment'
import {
  declarePaymentPlan, declarePaymentProduct, portalBranding, stripeSecrets,
} from '@owlmeans/server-payment'

stripeSecrets(cfg, { api: '/secrets/stripe-key' })          // `webhook` is an optional override
portalBranding(cfg, { returnUrl: 'https://app.example.com/billing', headline: 'Example' })

declarePaymentProduct(cfg, { sku: 'app-plans', type: ProductType.Service, services: ['app'], name: 'Plans' })
declarePaymentPlan(cfg, {
  productSku: 'app-plans', sku: 'free', duration: PlanDuration.Monthly, rank: 0, free: true, price: 0,
  capabilities: [{ scope: 'feature', permissions: { basic: true } }],
  limits: { seats: { kind: LimitKind.Occupancy, limit: 1 }, exports: { kind: LimitKind.Window, window: LimitWindow.Month, limit: 3 } },
})
declarePaymentPlan(cfg, {
  productSku: 'app-plans', sku: 'pro-monthly', duration: PlanDuration.Monthly, rank: 10, price: 20,
  recurring: { interval: 'month' },
  capabilities: [{ scope: 'feature', permissions: { basic: true, whitelabel: true } }],
  limits: { seats: { kind: LimitKind.Occupancy, limit: 5 }, exports: { kind: LimitKind.Window, window: LimitWindow.Day, limit: 20 } },
})

declarePaymentProduct(cfg, { sku: 'app-credits', type: ProductType.Consumable, services: ['app'], name: 'Credits' })
declarePaymentPlan(cfg, {
  productSku: 'app-credits', sku: 'app-credit-unit', duration: PlanDuration.Consumable, price: 0.02,
  pricingMode: CheckoutPricingMode.Amount,
  amountPolicy: { currency: 'usd', minimumMinor: 500, maximumMinor: 50_000, defaultMinor: 1_000,
    presetsMinor: [1_000, 5_000], fixedMinor: 0, rateBps: 200 },
})
```

`declarePaymentPlan` validates each declaration before recording it; `assertPlanDeclarations` checks
the catalogue as a whole (one free plan per rank, no two paid plans of a product at one rank) and runs
when the gateway initializes. A limit key may use a different kind on different plans — each kind keeps
its own counter window, so a lifetime count still sticks to the entity when it moves to a monthly plan.

## Wire the services

```typescript
import {
  appendPaymentGatewayService, entitlements, gateway, observer, paymentGateEntrypoints,
} from '@owlmeans/server-payment'

appendPaymentGatewayService(context)                    // the process that owns Stripe
appendPaymentGatewayService(context, { manage: false }) // a process that only reads entitlements
export const serverBindings = [...paymentGateEntrypoints]

observer(context).onTopUp(async completion => { /* credit, idempotent by completion.externalId */ })
observer(context).onSubscription(async event => { /* idempotent by event.eventKey */ })
observer(context).onRefund(async event => { /* claw back, idempotent by event.eventKey */ })
observer(context).onDispute(async event => { /* … */ })
observer(context).onPaymentFailed(async event => { /* notify */ })
```

A managed gateway brings Stripe to the declared state at boot — products and prices, one
customer-portal configuration, one webhook endpoint at this deployment's public URL (its signing
secret stored in `payment-webhook`) — and each step is fingerprinted, so an unchanged deployment
makes no Stripe call.

Several deployments of one service may share a Stripe account (typically every test-mode
deployment), each with its own database and URL — and a deployment's identity is its webhook URL,
even an undeliverable local one.

- **Webhook endpoint.** A deployment owns exactly the endpoint at its own URL: it deletes an
  endpoint only when its own `payment-webhook` rows name it — the endpoint of a URL it has moved away
  from — and never one it merely finds at another URL, whatever its metadata says. The endpoint of a
  retired deployment is removed by hand in the Stripe dashboard; one deleted from outside comes back
  on the next forced `resync`.
- **Portal configuration.** Each deployment has its own, tagged
  `{ owlmeans: 'payment', service, deployment: <webhook URL> }`. It updates the configuration its
  `portal:<service>` fingerprint row names, unless that one is tagged for another deployment, and
  without a row adopts only a configuration carrying exactly its own tag. Stripe cannot delete a
  portal configuration, so one a deployment can no longer identify stays in the account and a new
  one is created.

## Use it

```typescript
// Checkout and the portal (in-process; resolve the stable entityId at your authenticated boundary)
const url = await gateway(ctx).createLink(ctx, { productSku: 'app-plans', planSku: 'pro-monthly', entityId, service: 'app', successUrl })
const portal = await gateway(ctx).portalLink(ctx, entityId, { flow: PortalFlow.Change, planSku: 'pro-monthly', returnUrl })
await gateway(ctx).grantInternalPlan(ctx, entityId, 'free')   // when the organization is created

// What the entity may do
const view = await entitlements(ctx).entitlements(entityId)   // the EntitlementView a UI renders
await entitlements(ctx).hasCapability(entityId, 'feature:whitelabel')

// Spend a counted allowance — key it by the record it pays for
await entitlements(ctx).consume({ entityId, limitKey: 'exports', eventKey: `export:${reportId}`, ref: reportId })
await entitlements(ctx).release({ entityId, limitKey: 'exports', eventKey: `export:${reportId}` })

// Periodic repair
await reconcileAll(ctx, { freePlanSku: 'free' })
await entitlements(ctx).reconcileOccupancy(entityId, 'seats', liveSeatCount)
```

Routes declare what they need; the gates refuse before the handler:

```typescript
protocol(route(...), contract(...), { gate: { alias: ENTITLEMENT_GATE, params: ['feature:whitelabel'] } })
protocol(route(...), contract(...), { gate: { alias: LIMIT_GATE, params: [formatLimitParam('seats')] } })
```

`CapabilityRequired` and `LimitExhausted` extend `AuthForbidden`, so an HTTP boundary answers 403.
The limit gate never consumes; the handler does.

## Routes

`paymentGateEntrypoints` binds the immutable `paymentGate` tree: the public Stripe webhook
(`POST /payment-gate/webhook/:paygate`, verified by signature over the raw body), and two
Ed25519-guarded repairs — `resync` (products, portal, webhook endpoint) and `resyncSubscriptions`
(re-reads every live Stripe subscription, answering `{ scanned, updated }`).

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.35
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
