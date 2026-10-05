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

`declarePaymentPlan` validates each declaration before recording it;
`makePlanDeclarationsModel(cfg).assertPlans()` checks the catalogue as a whole (one free plan per
rank, no two paid plans of a product at one rank) and runs when the gateway initializes. A limit key
may use a different kind on different plans — each kind keeps its own counter window, so a lifetime
count still sticks to the entity when it moves to a monthly plan.

## Wire the services

```typescript
import { appendPaymentGatewayService, paymentAccessOf, paymentGateEntrypoints } from '@owlmeans/server-payment'

appendPaymentGatewayService(context)                    // the process that owns Stripe
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

A managed gateway brings Stripe to the declared state at boot — products and prices, one
customer-portal configuration, one webhook endpoint at this deployment's public URL (its signing
secret stored in `payment-webhook`) — and each step is fingerprinted, so an unchanged deployment
makes no Stripe call.

Three gateway options place that state when a deployment runs several processes:

| Option | Default | Decides |
|---|---|---|
| `webhookService` | `cfg.service` | the `cfg.services` alias whose host and base form the webhook URL — also the portal's deployment key |
| `owner` | `cfg.service` | the key of the `payment-webhook` rows, the signing-secret lookup, the `portal:<owner>` fingerprint and the Stripe labels |
| `bootstrap` | `manage` | whether this process runs the bootstrap at boot; a forced one (`resync`, `stripeBootstrapOf(ctx).bootstrapStripe(stripe, { force: true })`) runs in any managed process |

Give every process of the database the same `owner` and `webhookService` (the process that receives
the webhook), and keep `bootstrap` on that receiver only. Changing `webhookService` moves the
endpoint on the next bootstrap: created at the new URL, the endpoint of the owner's former URL
deleted, a new portal configuration for the new deployment key.

Several deployments of one application may share a Stripe account (typically every test-mode
deployment), each with its own database and URL — and a deployment's identity is its webhook URL,
even an undeliverable local one.

- **Webhook endpoint.** A deployment owns exactly the endpoint at its own URL: it deletes an
  endpoint only when its own `payment-webhook` rows name it — the endpoint of a URL it has moved away
  from — and never one it merely finds at another URL, whatever its metadata says. The endpoint of a
  retired deployment is removed by hand in the Stripe dashboard; one deleted from outside comes back
  on the next forced `resync`.
- **Portal configuration.** Each deployment has its own, tagged
  `{ owlmeans: 'payment', service: <owner>, deployment: <webhook URL> }`. It updates the configuration its
  `portal:<owner>` fingerprint row names, unless that one is tagged for another deployment, and
  without a row adopts only a configuration carrying exactly its own tag. Stripe cannot delete a
  portal configuration, so one a deployment can no longer identify stays in the account and a new
  one is created.

## Use it

```typescript
const payments = paymentAccessOf(ctx)   // the services, resources and settings of one context

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
`subscriptionHelper`, `checkoutPolicyHelper`, `stripeSessionHelper`, `consumerFormatHelper`,
`originHelper`) and helpers bound to one context, reached through their accessor — `paymentAccessOf(ctx)`,
`catalogueOf(ctx)`, `usageOf(ctx)`, `subscriptionCommitOf(ctx)`, `productSyncOf(ctx)`,
`stripeBootstrapOf(ctx)`, `reconcileOf(ctx)`, `checkoutPluginsOf(ctx)`, `stripeCheckoutOf(ctx)`,
`stripeSubscriptionsOf(ctx)`, `portalOf(ctx)`, `webhookOf(ctx)`, `estimateOf(ctx)`, `consumerMailOf(ctx)`.
The former free functions (`gateway`, `reconcileAll`, `webhookUrlOf`, …) remain as
deprecated delegates.

Routes declare what they need; the gates refuse before the handler:

```typescript
protocol(route(...), contract(...), { gate: { alias: ENTITLEMENT_GATE, params: ['feature:whitelabel'] } })
protocol(route(...), contract(...), { gate: { alias: LIMIT_GATE, params: [planLimitHelper.formatLimitParam('seats')] } })
```

`CapabilityRequired` and `LimitExhausted` extend `AuthForbidden`, so an HTTP boundary answers 403.
The limit gate never consumes; the handler does.

## Routes

`paymentGateEntrypoints` binds the immutable `paymentGate` tree: the public Stripe webhook
(`POST /payment-gate/webhook/:paygate`, verified by signature over the raw body; a missing or
unverifiable signature is a `PaygateSignatureError`, answered 400), and two
Ed25519-guarded repairs — `resync` (products, portal, webhook endpoint) and `resyncSubscriptions`
(re-reads every live Stripe subscription, answering `{ scanned, updated }`).

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
`paymentGate`'s paths (the webhook URL registered with Stripe is formed from them), contracts and
guards; bind each with `bind` — `bindAll` pairs a handler only with the declaration it was made for.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.48
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
