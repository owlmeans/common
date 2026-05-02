# @owlmeans/client-payment

Client-side payment service integration for the OwlMeans context system.

## Overview

- `makePaymentService(alias?)` — creates a payment service for context registration
- `appendPaymentService(context, alias?)` — attaches the payment service to an existing context
- Re-exports `PaymentService` and `DEFAULT_ALIAS` from `@owlmeans/payment`
- Adds `SHALLOW_AUTH` constant for shallow authentication state tracking

## Installation

```bash
bun add @owlmeans/client-payment
```

## Usage

```typescript
import { appendPaymentService } from '@owlmeans/client-payment'

appendPaymentService(context)
```

Access the payment service:

```typescript
import { DEFAULT_ALIAS } from '@owlmeans/client-payment'
import type { PaymentService } from '@owlmeans/client-payment'

const paymentService = context.service<PaymentService>(DEFAULT_ALIAS)
```

## API

### `makePaymentService(alias?): PaymentService`

Creates a payment service instance. `alias` defaults to `DEFAULT_ALIAS`.

### `appendPaymentService(context, alias?): void`

Registers the payment service in the given context.

### `SHALLOW_AUTH`

`'payment:shallow-auth'` — constant for tracking shallow authentication state in the payment flow.

## Related Packages

- [`@owlmeans/payment`](../payment) — `PaymentService` interface and `DEFAULT_ALIAS`
