---
description: "How to use @owlmeans/server-wl — server-side whitelist/allowlist (white-label) module declarations."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-wl

**Layer:** Server
**Install:** `"@owlmeans/server-wl": "^0.1.9"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `wlModules` | Server module declarations for whitelist endpoints |
| `Wl` server types | Server-side white-label types |

## Usage

```typescript
import { wlModules } from '@owlmeans/server-wl'
export const appModules = [...modules, ...wlModules, ...managerModules]
```

## Depends On

- `@owlmeans/wled`, `@owlmeans/server-entrypoint`, `@owlmeans/server-route`
