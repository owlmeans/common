# @owlmeans/server-payment

Server-side payments for OwlMeans applications: a provider-agnostic paygate host embedded in the
backend (amount and quantity checkout, subscriptions, the customer portal, refunds and disputes,
price estimates), a subscription store that understands a paygate subscription's whole lifecycle, the
EU consumer-rights records and functions, a usage ledger for counted plan limits, the entitlement
service that resolves what an organization entity may do, and the two gate services that refuse a
request before its handler runs. The contracts — plans, limits, promos, the entitlement view, the
refusal errors — live in `@owlmeans/payment`. A paygate is a payment provider package registered in
the context: the host names none and depends on none.

## Declare the catalogue

```typescript
import { CheckoutPricingMode, LimitKind, LimitWindow, PlanDuration, ProductType } from '@owlmeans/payment'
import { declarePaymentPlan, declarePaymentPricing, declarePaymentProduct } from '@owlmeans/server-payment'

declarePaymentPricing(cfg, { tax: { automatic: true, collectTaxId: true, estimate: false }, currency: { estimate: false } })

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

`declarePaymentPlan` validates each declaration before recording it;
`makePlanDeclarationsModel(cfg).assertPlans()` checks the catalogue as a whole (one free plan per
rank, no two paid plans of a product at one rank) and runs when the gateway initializes. A plan is
sold through the paygates its `gateways` (else its product's) name — neither declared means every
registered paygate. `declarePaymentPricing` takes the browser-safe policy only (`tax`, `currency`);
a provider declares its own settings through its own package.

## Wire the services

```typescript
import { appendPaymentGatewayService, paymentAccessOf, paymentGateEntrypoints } from '@owlmeans/server-payment'

appendMyProvider(context)                               // a provider package's `append…`: registers its paygate, every process
appendPaymentGatewayService(context)                    // the process that talks to the paygates
appendPaymentGatewayService(context, { manage: false }) // a process that only reads entitlements
// several managed processes on one database — the same `owner` and `webhookService` in each:
appendPaymentGatewayService(context, { owner: 'app-api', webhookService: 'app-hooks' })                   // receives the webhook
appendPaymentGatewayService(context, { owner: 'app-api', webhookService: 'app-hooks', bootstrap: false }) // checkout and portal
export const serverBindings = [...paymentGateEntrypoints]

const paid = paymentAccessOf(context).observer()
paid.onTopUp(async completion => { /* credit, idempotent by completion.externalId */ })
paid.onSubscription(async event => { /* idempotent by event.eventKey */ })
paid.onRefund(async event => { /* claw back, idempotent by event.eventKey */ })
paid.onDispute(async event => { /* … */ })
paid.onPaymentFailed(async event => { /* notify */ })
```

Payment providers register into a lazy service (`ensurePaymentProviders(ctx).register(provider)`);
`paygatesOf(ctx)` binds each once per context. A provider implements `PaymentProvider { id, features,
bind(ctx) }`: `customers` and `checkout` are required, `subscriptions`, `payments` (and
`creditNotes`), `webhook`, `catalogue`, `portal`, `tax` and `fx` optional — the host reacts to each
absence in a defined way (no recurring plans without `subscriptions`, review instead of a refund
without `payments`, `PortalUnavailable('paygate')` without `portal`, …). A declared policy feature a
registered paygate lacks fails the boot, and so does a managed, bootstrapping gateway without any
provider.

A managed gateway brings every paygate to the declared state at boot — products and prices, its
customer-portal configuration, one webhook endpoint at this deployment's public URL — each step
fingerprinted, so an unchanged deployment makes no paygate call.

Three gateway options place that state when a deployment runs several processes:

| Option | Default | Decides |
|---|---|---|
| `webhookService` | `cfg.service` | the `cfg.services` alias whose host and base form the webhook URL (`/payment-gate/webhook/<paygate>`) — also the portal's deployment key |
| `owner` | `cfg.service` | the key of the `payment-webhook` rows, the signing-secret lookup and the paygate's own labels |
| `bootstrap` | `manage` | whether this process runs the bootstrap at boot; a forced one (`resync`, `paygateBootstrapOf(ctx).bootstrap({ force: true })`) runs in any managed process |

Give every process of the database the same `owner` and `webhookService` (the process that receives
the webhook), and keep `bootstrap` on that receiver only.

## Use it

```typescript
const payments = paymentAccessOf(ctx)   // the services, resources, settings and paygates of one context

// Checkout and the portal (in-process; resolve the stable entityId at your authenticated boundary)
const url = await payments.gateway().createLink(ctx, { productSku: 'app-plans', planSku: 'pro-monthly', entityId, service: 'app', successUrl })
const portal = await payments.gateway().portalLink(ctx, entityId, { flow: PortalFlow.Change, planSku: 'pro-monthly', returnUrl })
await payments.gateway().grantInternalPlan(ctx, entityId, 'free')   // when the organization is created

// What the entity may do
const view = await payments.entitlements().entitlements(entityId)   // the EntitlementView a UI renders
await payments.entitlements().hasCapability(entityId, 'feature:whitelabel')

// Spend a counted allowance — key it by the record it pays for
await payments.entitlements().consume({ entityId, limitKey: 'exports', eventKey: `export:${reportId}`, ref: reportId })
await payments.entitlements().release({ entityId, limitKey: 'exports', eventKey: `export:${reportId}` })

// Periodic repair
await reconcileOf(ctx).reconcileAll({ freePlanSku: 'free' })
await payments.entitlements().reconcileOccupancy(entityId, 'seats', liveSeatCount)
```

The package's functionality comes as objects: pure helpers with a ready instance (`planHelper`,
`subscriptionHelper`, `checkoutPolicyHelper`, `checkoutSnapshotHelper`, `consumerFormatHelper`,
`originHelper`) and helpers bound to one context, reached through their accessor —
`paymentAccessOf(ctx)`, `paygatesOf(ctx)`, `catalogueOf(ctx)`, `usageOf(ctx)`,
`subscriptionCommitOf(ctx)`, `productSyncOf(ctx)`, `paygateBootstrapOf(ctx)`, `reconcileOf(ctx)`,
`checkoutPluginsOf(ctx)`, `checkoutOf(ctx)`, `paygateSubscriptionsOf(ctx)`, `paymentEventsOf(ctx)`,
`portalOf(ctx)`, `webhookOf(ctx)`, `estimateOf(ctx)`, `fxOf(ctx)`, `captureOf(ctx)`,
`consumerRecordsOf(ctx)`, `consumerMailOf(ctx)`. The former free functions (`gateway`,
`reconcileAll`, `webhookUrlOf`, …) remain as deprecated delegates.

Routes declare what they need; the gates refuse before the handler:

```typescript
protocol(route(...), contract(...), { gate: { alias: ENTITLEMENT_GATE, params: ['feature:whitelabel'] } })
protocol(route(...), contract(...), { gate: { alias: LIMIT_GATE, params: [planLimitHelper.formatLimitParam('seats')] } })
```

`CapabilityRequired` and `LimitExhausted` extend `AuthForbidden`, so an HTTP boundary answers 403.
The limit gate never consumes; the handler does.

## Routes

`paymentGateEntrypoints` binds the immutable `paymentGate` tree: the public webhook
(`POST /payment-gate/webhook/:paygate` — the paygate must be registered, else `UnknownPaygate`; it
verifies the signature over the raw body, a missing or unverifiable one is a `PaygateSignatureError`,
answered 400), and two Ed25519-guarded repairs — `resync` (products, portal, webhook endpoint of every
paygate) and `resyncSubscriptions` (re-reads every live paygate subscription, answering
`{ scanned, updated }`).

An application that declares the gate itself — its own aliases, pinned to the service that receives
the webhook — binds its declarations to the same actions instead, and registers nothing of
`paymentGate`:

```typescript
import { bind } from '@owlmeans/server-app'
import { paymentGateHandlers } from '@owlmeans/server-payment'

export const hookBindings = [
  bind(own.base),
  bind(own.webhook, paymentGateHandlers.webhook),
  bind(own.resync, paymentGateHandlers.resync),
  bind(own.resyncSubscriptions, paymentGateHandlers.resyncSubscriptions),
]
```

Each handler runs in the context of the entrypoint it is bound to. The declarations keep
`paymentGate`'s paths (the webhook URL a paygate is pointed at is formed from them), contracts and
guards; bind each with `bind` — `bindAll` pairs a handler only with the declaration it was made for.

## Testing

`@owlmeans/test-payment` builds a real server context over in-memory resources with a fake paygate
(`makeFakeContext`, `makeFakePaygate`) — what this package's own specs run on.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.2
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
