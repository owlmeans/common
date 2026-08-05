---
description: "How to use @owlmeans/flow — state-machine / workflow execution framework with typed state, transitions, and flow definitions. Use when implementing multi-step workflows."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/flow

**Layer:** Core
**Install:** `"@owlmeans/flow": "^0.1.12"` in `dependencies`

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

```typescript
import { Flow } from '@owlmeans/flow'

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

- `@owlmeans/error`, `@owlmeans/i18n`
