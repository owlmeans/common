---
name: client-flow
description: How to use @owlmeans/client-flow — client-side flow execution service (makeBasicFlowService, createFlowClient) that drives @owlmeans/flow definitions through state transitions. Auto-invoked when importing client flow primitives.
user-invocable: false
---

# @owlmeans/client-flow

**Layer:** Client
**Install:** `"@owlmeans/client-flow": "^0.1.18-rc.16"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeBasicFlowService(alias?)` | Client flow execution service factory — the platform-agnostic half |
| `createFlowClient(context, nav)` | The runner a screen drives: it advances the flow and navigates to each step |
| `FlowService`, `FlowClient` | The service and runner interfaces |
| Constants | `DEFAULT_ALIAS` (`flow`) |

## Usage

```typescript
import { makeBasicFlowService } from '@owlmeans/client-flow'
context.registerService(makeBasicFlowService())
```

The runner moves between steps by asking the target entrypoint for its address —
`await entrypoint.url(request)` — and handing that to the `Navigator`, so a flow step is named by
alias and a redirect to another service comes out absolute on its own.

## Depends On

- `@owlmeans/flow`, `@owlmeans/client`, `@owlmeans/client-context`, `@owlmeans/client-entrypoint`
