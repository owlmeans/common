---
name: web-flow
description: How to use @owlmeans/web-flow — web-specific flow execution and UI state management built on @owlmeans/client-flow. Auto-invoked when importing web flow primitives.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-flow

**Layer:** Web (React)
**Install:** `"@owlmeans/web-flow": "^0.1.17"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeWebFlowService()` | Web flow service factory |
| Helpers | URL/query-string flow state helpers |
| Constants | Flow service aliases |

## Usage

```typescript
import { makeWebFlowService } from '@owlmeans/web-flow'
context.registerService(makeWebFlowService())
```

## Depends On

- `@owlmeans/flow`, `@owlmeans/client-flow`, `@owlmeans/web-client`
