---
description: "How to use @owlmeans/api-config-server — server-side modules that expose the API config endpoint consumed by api-config-client."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/api-config-server

**Layer:** Server
**Install:** `"@owlmeans/api-config-server": "^0.1.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `modules` | Server api-config module declarations |

## Usage

```typescript
import { modules as apiConfigServerModules } from '@owlmeans/api-config-server'
export const appModules = [...modules, ...apiConfigServerModules, ...managerModules]
```

## Depends On

- `@owlmeans/api-config`, `@owlmeans/server-entrypoint`, `@owlmeans/server-context`
