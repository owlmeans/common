---
description: "How to use @owlmeans/web-db — browser IndexedDB-backed storage service for client-side persistence."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-db

**Layer:** Web (React)
**Install:** `"@owlmeans/web-db": "^0.1.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeWebDbService()` | IndexedDB-backed service factory |
| Constants | Default DB / object store names |
| Types | DB service interface |

## Usage

```typescript
import { makeWebDbService } from '@owlmeans/web-db'
context.registerService(makeWebDbService())
```

## Depends On

- `@owlmeans/client-resource`, `@owlmeans/client-context`
