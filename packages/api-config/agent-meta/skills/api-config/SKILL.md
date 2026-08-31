---
name: api-config
description: How to use @owlmeans/api-config — module declarations for fetching API/service configuration at runtime. Auto-invoked when importing api-config types or modules.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/api-config

**Layer:** Core
**Install:** `"@owlmeans/api-config": "^0.1.18-rc.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ApiConfig` types | Shape of remotely-served API config |
| Modules | Module declarations for the config endpoint |
| Constants | Module aliases, route paths |

## Usage

Pair with `@owlmeans/api-config-client` (browser) or `@owlmeans/api-config-server` (Fastify) for the runtime side. The `api-config` package itself defines the shared module/route shape.

```typescript
import { modules as apiConfigModules } from '@owlmeans/api-config'
const appModules = [...apiConfigModules, ...myModules]
```

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/config`
