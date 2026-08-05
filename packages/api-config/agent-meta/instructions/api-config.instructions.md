---
description: "How to use @owlmeans/api-config — module declarations for fetching API/service configuration at runtime."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/api-config

**Layer:** Core
**Install:** `"@owlmeans/api-config": "^0.1.14"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ApiConfig` types | Shape of remotely-served API config |
| Modules | Module declarations for the config endpoint |
| Constants | Module aliases, route paths |

## Usage

```typescript
import { modules as apiConfigModules } from '@owlmeans/api-config'
const appModules = [...apiConfigModules, ...myModules]
```

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/config`
