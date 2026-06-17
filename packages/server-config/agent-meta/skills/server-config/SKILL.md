---
name: server-config
description: How to use @owlmeans/server-config — server-side config helpers and validation building on @owlmeans/config. Auto-invoked when importing server config helpers.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-config

**Layer:** Server
**Install:** `"@owlmeans/server-config": "^0.1.10"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Config` (server) types | Server-side Config interface (extends core Config) |
| `serverConfig(...)` helpers | Build a typed server config |
| Helpers | Resolve trusted entities, secret paths |

## Usage

```typescript
import { serverConfig } from '@owlmeans/server-config'
import { AppType } from '@owlmeans/config'

const cfg = serverConfig({ service: 'my-api', type: AppType.Backend, port: 8080 })
```

## Depends On

- `@owlmeans/config`, `@owlmeans/auth`, `@owlmeans/server-context`
