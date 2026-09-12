---
name: server-payment
description: Public in-process Stripe gateway for OwlMeans backends — amount and quantity checkout, subscriptions, protocol-bound webhook routes, product sync, fulfillment observers and entitlement gates. Use when wiring @owlmeans/server-payment or changing Stripe payment behavior.
user-invocable: false
---

# @owlmeans/server-payment

Public MIT package in the common monorepo. It embeds Stripe into an application backend; the
consumer owns products, credit conversion and entitlement side effects. It persists customers,
subscriptions/fulfilled sessions and sync fingerprints in Mongo.

## Wiring

```typescript
stripeSecrets(cfg, { api: '/secrets/stripe-key', webhook: '/secrets/stripe-webhook' })
declarePaymentProduct(cfg, { sku: 'credits', type: ProductType.Consumable,
  services: ['app'], name: 'Credits', taxCode: 'txcd_10103000' })
declarePaymentPlan(cfg, { productSku: 'credits', sku: 'credits-unit',
  duration: PlanDuration.Consumable, price: 0.02,
  pricingMode: CheckoutPricingMode.Amount, amountPolicy })

appendPaymentGatewayService(context)
export const appEntrypoints = [...paymentGateEntrypoints]
observer(context).onTopUp(async completion => { /* append an idempotent ledger event */ })
```

`declarePaymentPlan` validates amount and quantity policies immediately. An amount plan requires
`amountPolicy`; a quantity/legacy plan may declare `quantityPolicy` or the legacy min/default/max
fields. `gateway(ctx).createLink(...)` takes the stable internal `entityId`; an authenticated public
handler must resolve that id from its request entity before calling the in-process service.

## Checkout modes

- `Amount`: validate `amountMinor`, compute `chargeAmountMinor`, create one inline
  `price_data` item for the synchronized Stripe Product, quantity 1, tax-exclusive, with no
  adjustable quantity and no promotion codes. No reusable Stripe Price is created; a superseded
  quantity Price under the plan lookup key is deactivated.
- `Quantity`: load the reusable Stripe Price and create an adjustable item from the quantity
  policy. This remains supported so existing consumers and already-open Checkout sessions work.
- Subscription: reusable recurring Stripe Price, quantity 1, with billing portal management.

Every session enables automatic tax, billing address and tax-id collection. Amount metadata carries
pricing mode, net amount, adjusted pre-tax subtotal, currency, product, plan, service and owner.

## Fulfillment

Handle both `checkout.session.completed` and `checkout.session.async_payment_succeeded`, but grant
nothing until `payment_status === 'paid'`. Amount fulfillment compares Stripe currency and actual
`amount_subtotal` with the server-created metadata. Completion is discriminated:

- `{ mode: 'amount', amountMinor, chargeAmountMinor, currency, ... }`
- `{ mode: 'quantity', units, ... }`

The session id is `externalId`. A pending fulfillment record is created before calling observers
and gets `fulfilledAt` only after they succeed; observer failures escape so Stripe retries. Consumer
callbacks must still use `externalId` as their own append-only event key, covering a crash after the
side effect and before `fulfilledAt`. A session without pricing-mode metadata is a legacy quantity
session and remains fulfillable.

Subscription observers receive `{ isNew, status, capabilities, limits, ... }`. One-time bundles go
behind `isNew` and use an idempotent external event key. Status updates and entitlement provisioning
must be safe to repeat.

## Protocols and security

`paymentGate` is an immutable protocol tree. `paymentGateEntrypoints` binds its base, webhook, and
resync declarations directly with `bind(protocol, handler)`; the webhook is public because Stripe
signature verification requires the untouched raw body, while resync carries the ED25519 guard.
Never put an application auth guard on the Stripe webhook.

`appendPaymentGatewayService` also registers `ENTITLEMENT_GATE`. Paid capabilities belong on shared
route declarations through `entitled(...)`, not in handlers. The gate fails closed when the
subscription store cannot be read.

## External docs

- https://docs.stripe.com/api/checkout/sessions/create — Checkout accepts inline `price_data` with integer minor-unit `unit_amount`; automatic tax is enabled on the Session and amount items are tax-exclusive.
- https://docs.stripe.com/checkout/fulfillment — Fulfillment must be idempotent, check payment state and support delayed-payment success events rather than trusting completion alone.
