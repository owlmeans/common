---
description: "How to use @owlmeans/client-payment — client-side payment service that wraps @owlmeans/payment for use from a React app."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-payment

**Layer:** Client
**Install:** `"@owlmeans/client-payment": "^0.1.11"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makePaymentService()` | Client payment service factory |
| Payment types | Re-exports / extends `@owlmeans/payment` |
| Constants | Service aliases |

## Usage

```typescript
import { makePaymentService } from '@owlmeans/client-payment'
context.registerService(makePaymentService())
```

## Depends On

- `@owlmeans/payment`, `@owlmeans/client-context`, `@owlmeans/client-entrypoint`
