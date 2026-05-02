# @owlmeans/payment

Payment service abstraction — product catalog, subscription management, and Stripe checkout integration.

## Overview

- `makePaymentService(alias?)` — creates a payment service for context registration
- `appendPaymentService(context, alias?)` — registers the payment service in the context
- `PaymentService` — interface for products, plans, subscriptions, and checkout session creation
- `CreateCheckoutBody` / `CreateCheckoutResponse` — request/response types for checkout

## Installation

```bash
bun add @owlmeans/payment
```

## Usage

Create a checkout session:

```typescript
import type { CreateCheckoutBody, CreateCheckoutResponse } from '@owlmeans/payment'

const [result] = await ctx.module<ClientModule<CreateCheckoutResponse>>(
  paymentApi.service.checkout.session.external.create
).call({
  body: {
    productSku: 'vib-tokens',
    entityId,
    service: VIB_ALIAS,
    successUrl: helper.makeUrl(service)
  } satisfies CreateCheckoutBody
})
window.open(result.url, '_blank')
```

Handle subscription propagation:

```typescript
import { SubscriptionPropagateBody, PlanDuration, SubscriptionStatus } from '@owlmeans/payment'

const handler = handleBody<SubscriptionPropagateBody>(async (body, context) => {
  if (body.status === SubscriptionStatus.Consumable) {
    const tokens = body.capabilities?.find(
      c => c.scope === PlanDuration.Consumable
    )?.permissions.units ?? 0
    await ctx.agentToken().topUpTokens(entityId, tokens * 1000)
  }
})
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

- `CreateCheckoutBody` — `{ productSku, entityId, service, successUrl?, cancelUrl? }`
- `CreateCheckoutResponse` — `{ url: string }`
- `SubscriptionPropagateBody` — extends `PlanSubscription`
- `PlanSubscription` — `{ sku, entityId, createdAt, status, capabilities? }`

### Enums

- `PlanDuration` — `Monthly`, `Yearly`, `Consumable`, etc.
- `SubscriptionStatus` — `Active`, `Consumable`, `Canceled`, etc.
- `ProductType` — product category enum
- `PaymentEntityType` — entity classification enum

## Related Packages

- [`@owlmeans/client-payment`](../client-payment) — client-side wrapper for browser contexts
