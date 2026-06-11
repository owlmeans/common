---
description: "How to use @owlmeans/web-wl — web white-label / whitelist UI components, modules, and service."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-wl

**Layer:** Web (React)
**Install:** `"@owlmeans/web-wl": "^0.1.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `wlModules` | Web-side wled module declarations |
| `makeWlService()` | Web-side wled service factory |
| `components` | React components for whitelist entries |
| Constants | Web-specific aliases |

## Usage

```typescript
import { wlModules, makeWlService } from '@owlmeans/web-wl'
context.registerService(makeWlService())
const modules = [...baseModules, ...wlModules, ...managerModules]
```

## Depends On

- `@owlmeans/wled`, `@owlmeans/client-wl`, `@owlmeans/web-client`, `@owlmeans/web-panel`, `react`
