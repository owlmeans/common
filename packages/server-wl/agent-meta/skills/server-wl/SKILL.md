---
name: server-wl
description: How to use @owlmeans/server-wl — server-side whitelist/allowlist (white-label) module declarations to add to your appModules. Auto-invoked when importing server-wl modules.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-wl

**Layer:** Server
**Install:** `"@owlmeans/server-wl": "^0.1.18-rc.8"` in `dependencies`

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

White-label DNS/routing service is typically wired separately as `@owlmeans/server-wl-dns` (downstream package).

## Depends On

- `@owlmeans/wled`, `@owlmeans/server-entrypoint`, `@owlmeans/server-route`
