---
name: flow
description: How to use @owlmeans/flow — state-machine / workflow execution framework with typed state, transitions, and flow definitions. Auto-invoked when importing from this package or implementing multi-step workflows.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/flow

**Layer:** Core
**Install:** `"@owlmeans/flow": "^0.1.11"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Flow` types | Flow definition shape (states, transitions, payload) |
| `FlowState` | State management primitives |
| Errors | Flow execution errors |
| Constants | Built-in state names, transition types |
| Helpers | Flow construction and validation |
| `flows` submodule | Built-in flow definitions |
| i18n | Translatable error messages |

## Usage

Define a flow with typed states, then drive it from `@owlmeans/client-flow` (cross-platform) or `@owlmeans/web-flow` (web):

```typescript
import { Flow, FlowState } from '@owlmeans/flow'

const onboardingFlow: Flow = {
  alias: 'onboarding',
  initial: 'welcome',
  states: {
    welcome: { on: { NEXT: 'profile' } },
    profile: { on: { NEXT: 'done', BACK: 'welcome' } },
    done: { type: 'final' }
  }
}
```

## Depends On

- `@owlmeans/error` — flow errors
- `@owlmeans/i18n` — translatable error messages
