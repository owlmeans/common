---
description: "How to use @owlmeans/client-flow — client-side flow execution service that drives @owlmeans/flow definitions through state transitions."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-flow

**Layer:** Client
**Install:** `"@owlmeans/client-flow": "^0.1.11"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeFlowService()` | Client flow execution service factory |
| `client` helpers | Flow client/runner |
| Constants | Flow service aliases |

## Usage

```typescript
import { makeFlowService } from '@owlmeans/client-flow'
context.registerService(makeFlowService())
```

## Depends On

- `@owlmeans/flow`, `@owlmeans/client-context`, `@owlmeans/client-entrypoint`
