---
name: payment
description: How to use @owlmeans/payment — payment processing types, models, errors, paymentApi service alias for cross-service checkout calls. Auto-invoked when importing payment types or invoking checkout flows.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/payment

**Layer:** Core
**Install:** `"@owlmeans/payment": "^0.1.16-rc.0"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `paymentApi` | Service alias tree for payment endpoints (e.g. `paymentApi.service.checkout.session.external.create`) |
| `Payment`, `Checkout` types | Domain model shapes |
| `paymentModules` | Entrypoint declarations to spread into `appModules` |
| Errors | Typed payment errors |
| Constants | Payment service aliases |
| `model` submodule | Reusable payment models |
| i18n | Translatable error messages |

## Subpath Exports

- `./utils` — payment helpers

## Usage

Spread the entrypoints into your app, then call them via `ctx.entrypoint(paymentApi....)`:

```typescript
import { paymentApi, paymentModules } from '@owlmeans/payment'
import type { CreateCheckoutResponse } from '@owlmeans/payment'
import type { ClientEntrypoint } from '@owlmeans/entrypoint'

export const appModules = [...modules, ...paymentModules]

// In a handler:
const [result] = await ctx.entrypoint<ClientEntrypoint<CreateCheckoutResponse>>(
  paymentApi.service.checkout.session.external.create
).call({
  body: { productSku: 'tokens', entityId, service: VIB_ALIAS, successUrl: helper.makeUrl(service) }
})
```

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`
- `@owlmeans/auth`, `@owlmeans/error`, `@owlmeans/i18n`
