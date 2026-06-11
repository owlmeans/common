---
description: "How to use @owlmeans/error — base error classes (ResilientError), error normalization, and i18n-aware error types. Use when importing from this package or defining typed framework errors."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/error

**Layer:** Core
**Install:** `"@owlmeans/error": "^0.1.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ResilientError` | Base error class — all framework errors extend this |
| `ErrorNormalizer` | Normalize unknown errors into ResilientError instances |
| `ErrorTypes` | Built-in error type aliases |
| i18n helpers | Resolve error messages through the i18n layer |

## Usage

Subclass `ResilientError` for typed framework errors:

```typescript
import { ResilientError } from '@owlmeans/error'

export class AgentApiError extends ResilientError {
  public static override typeName = 'AgentApiError'
  public constructor(message: string = 'unknown') {
    super(AgentApiError.typeName, `agent-api:${message}`)
  }
}

throw new AgentApiError('rate-limited')
```

## Depends On

- `@owlmeans/i18n` — for resolving error messages by key
