---
name: web-flow
description: How to use @owlmeans/web-flow — web-specific flow execution (makeFlowService, appendFlowService, useFlow) and URL-carried flow state built on @owlmeans/client-flow. Auto-invoked when importing web flow primitives.
user-invocable: false
---

# @owlmeans/web-flow

**Layer:** Web (React)
**Install:** `"@owlmeans/web-flow": "^0.1.18-rc.16"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeFlowService(alias?)` | Web flow service factory — the browser `proceed`/`goHome` on top of the basic one |
| `appendFlowService(ctx, alias?)` | Register it plus the client resource the flow state lives in |
| `useFlow(target?)` | The `FlowClient` for the screen currently rendering |
| Constants | `DEFAULT_ALIAS` (`flow`), `QUERY_PARAM` (`flow`), `SERVICE_PARAM` (`service`) |

## Usage

```typescript
import { appendFlowService } from '@owlmeans/web-flow'
appendFlowService(context)
```

`proceed` addresses the step's entrypoint with `url(request, { absolute: true })` and carries the
serialized flow in the `flow` query parameter, so a step that lives in another service is a plain
browser redirect and the receiving app rehydrates the flow from the URL.

## Depends On

- `@owlmeans/flow`, `@owlmeans/client-flow`, `@owlmeans/client-resource`, `@owlmeans/client-entrypoint`
