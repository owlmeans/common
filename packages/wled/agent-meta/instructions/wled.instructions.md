---
description: "How to use @owlmeans/wled — whitelist/allowlist (white-label) entity types, model, and shared module declarations."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/wled

**Layer:** Core
**Install:** `"@owlmeans/wled": "^0.1.14"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Wled`, `Entity` types | Whitelist entry / entity shapes |
| `WL_BUCKET` and constants | Shared aliases |
| Modules | Shared whitelist module declarations |
| `model` submodule | Validation/model helpers |

## Usage

```typescript
import { WL_BUCKET } from '@owlmeans/wled'
cfg.storageBuckets = { [WL_BUCKET]: { url: '...', apiKey: '...', basePrefix: WL_BUCKET_PREFIX } }
```

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/auth-common`
