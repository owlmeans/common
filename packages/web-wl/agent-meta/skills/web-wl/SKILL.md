---
name: web-wl
description: How to use @owlmeans/web-wl — web white-label / whitelist UI components, modules, and service. Auto-invoked when importing web-wl primitives or building white-label features in a web app.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-wl

**Layer:** Web (React)
**Install:** `"@owlmeans/web-wl": "^0.1.16-rc.0"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `wlModules` | Web-side wled module declarations |
| `makeWlService()` | Web-side wled service factory |
| `components` | React components for managing whitelist entries |
| Constants | Web-specific aliases |

## Usage

```typescript
import { wlModules, makeWlService } from '@owlmeans/web-wl'

context.registerService(makeWlService())
const modules = [...baseModules, ...wlModules, ...managerModules]
```

A common downstream variant (`@owlmeans/web-wl-manager`) provides a manager-store helper like `setupWlManagerStore<C, T>(context)`.

## Depends On

- `@owlmeans/wled`, `@owlmeans/client-wl`, `@owlmeans/web-client`, `@owlmeans/web-panel`
- `react` (peer)
