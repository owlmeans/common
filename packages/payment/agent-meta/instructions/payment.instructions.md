---
description: "How to use @owlmeans/payment — payment processing types, models, errors, paymentApi service alias for cross-service checkout calls."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/payment

**Layer:** Core
**Install:** `"@owlmeans/payment": "^0.1.14"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `paymentApi` | Service alias tree |
| `Payment`, `Checkout` types | Domain shapes |
| `paymentModules` | Entrypoints to spread into `appModules` |
| Errors | Typed payment errors |
| Constants | Payment service aliases |
| `model` submodule | Reusable payment models |

## Subpath Exports

- `./utils` — payment helpers

## Usage

```typescript
import { paymentApi, paymentModules } from '@owlmeans/payment'

export const appModules = [...modules, ...paymentModules]

const [result] = await ctx.entrypoint<ClientEntrypoint<CreateCheckoutResponse>>(
  paymentApi.service.checkout.session.external.create
).call({ body: { productSku: 'tokens', entityId, successUrl } })
```

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/auth`, `@owlmeans/error`, `@owlmeans/i18n`
