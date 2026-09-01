---
name: client-did
description: How to use @owlmeans/client-did — client-side DID wallet account management built on @owlmeans/did. Auto-invoked when importing client DID services.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-did

**Layer:** Client
**Install:** `"@owlmeans/client-did": "^0.1.18-rc.11"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeDidService()` | Client-side DID wallet service factory |
| Account helpers | Wallet account creation/import |
| Constants | DID service aliases |

## Usage

```typescript
import { makeDidService } from '@owlmeans/client-did'
context.registerService(makeDidService())
```

## Depends On

- `@owlmeans/did`, `@owlmeans/client-context`, `@owlmeans/basic-keys`
