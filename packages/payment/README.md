# @owlmeans/payment

Payment contracts and service abstractions for product catalogs, subscriptions, and amount- or
quantity-priced checkout.

## Overview

- `makePaymentService(alias?)` — creates a payment service for context registration
- `appendPaymentService(context, alias?)` — registers the payment service in the context
- `PaymentService` — interface for products, plans, subscriptions, and checkout session creation
- `paymentApi` — immutable protocol declarations for subscription propagation and checkout
- `CheckoutPricingMode` plus amount/quantity checkout policy schemas and validators
- `chargeAmountMinor()` — integer-minor-unit processing adjustment calculation

## Installation

```bash
bun add @owlmeans/payment@^0.1.18-rc.13
```

## Usage

Create a checkout session:

```typescript
import { paymentApi } from '@owlmeans/payment'

const result = await ctx.entrypoint(
  paymentApi.service.checkout.session.external.create,
).call({
  body: {
    productSku: 'vib-tokens',
    entitySlug,
    service: VIB_ALIAS,
    amountMinor: 1_000,
    successUrl: helper.makeUrl(service)
  }
})
window.location.assign(result.url)
```

## API

### `makePaymentService(alias?): PaymentService`

Creates the payment service.

### `PaymentService`

- `product(sku): Promise<Product>` — get a product by SKU
- `products(): Promise<Product[]>` — list all products
- `plans(productSku, duration): Promise<ProductPlan[]>` — list plans for a product
- `plan(planSku): Promise<ProductPlan>` — get a plan by SKU
- `shallowAuthentication(token): Promise<string>` — shallow auth for payment flows
- `localize(lng, entity): Promise<Localization | null>` — get localized payment content

### Types

- `CreateCheckoutBody` — `{ productSku, entitySlug, service, amountMinor?, successUrl?, cancelUrl? }`
- `CreateCheckoutResponse` — `{ url: string }`
- `AmountCheckoutPolicy` — integer minor-unit bounds, presets, currency, fixed and basis-point adjustments
- `QuantityCheckoutPolicy` — integer quantity bounds and default
- `SubscriptionPropagateBody` — propagation wire shape with `entitySlug`, never the stored `entityId`
- `PlanSubscription` — `{ sku, entityId, createdAt, status, capabilities? }`

### Enums

- `PlanDuration` — `Monthly`, `Yearly`, `Consumable`, etc.
- `SubscriptionStatus` — `Active`, `Consumable`, `Canceled`, etc.
- `ProductType` — product category enum
- `PaymentEntityType` — entity classification enum
- `CheckoutPricingMode` — `Amount` or `Quantity`

## Related Packages

- [`@owlmeans/client-payment`](../client-payment) — client-side wrapper for browser contexts

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.20
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
