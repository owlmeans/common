---
description: "How to use @owlmeans/payment — payment processing types, models, errors, paymentApi service alias for cross-service checkout calls."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/payment

**Layer:** Core
**Install:** `"@owlmeans/payment": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `paymentApi` | Service alias tree |
| `Payment`, `Checkout` types | Domain shapes |
| `paymentModules` | Modules to spread into `appModules` |
| Errors | Typed payment errors |
| Constants | Payment service aliases |
| `model` submodule | Reusable payment models |

## Subpath Exports

- `./utils` — payment helpers

## Usage

```typescript
import { paymentApi, paymentModules } from '@owlmeans/payment'

export const appModules = [...modules, ...paymentModules]

const [result] = await ctx.module<ClientModule<CreateCheckoutResponse>>(
  paymentApi.service.checkout.session.external.create
).call({ body: { productSku: 'tokens', entityId, successUrl } })
```

## Depends On

- `@owlmeans/module`, `@owlmeans/route`, `@owlmeans/auth`, `@owlmeans/error`, `@owlmeans/i18n`
