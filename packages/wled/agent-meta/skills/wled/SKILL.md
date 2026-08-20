---
name: wled
description: How to use @owlmeans/wled — whitelist/allowlist ("white-label") entity types, model, and shared module declarations. Auto-invoked when importing wled types or building white-label features.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/wled

**Layer:** Core
**Install:** `"@owlmeans/wled": "^0.1.18-rc.6"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Wled`, `Entity` types | Whitelist entry / entity shapes |
| `WL_BUCKET` and constants | Shared aliases (e.g. storage bucket name) |
| Modules | Shared whitelist module declarations |
| `model` submodule | Validation/model helpers |

## Usage

```typescript
import { WL_BUCKET } from '@owlmeans/wled'

cfg.storageBuckets = {
  [WL_BUCKET]: { url: '/etc/app-config/s3-bucket-url', apiKey: '/etc/master-secret/s3-storage', basePrefix: WL_BUCKET_PREFIX }
}
```

Server side wires the module declarations through `@owlmeans/server-wl`; web side through `@owlmeans/web-wl` / `@owlmeans/client-wl`.

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/auth-common`
