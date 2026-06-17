---
description: "How to use @owlmeans/web-panel — base browser context factory (makeContext) with Material-UI + React Router 7 wired in, plus form/panel components."
applyTo: "**/context.ts, **/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-panel

**Layer:** Web (React)
**Install:** `"@owlmeans/web-panel": "^0.1.10"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeContext<C, T>(cfg)` | Base web context factory (MUI + React Router) |
| `components` submodule | Material-UI panel/form components |
| Re-exports from `@owlmeans/client-panel` | Cross-platform panel primitives |

## Subpath Exports

- `./auth`, `./auth/modules`

## Usage

```typescript
import { makeContext as makeBasicContext } from '@owlmeans/web-panel'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  context.makeContext = makeContext as typeof context.makeContext
  return context
}
```

## Depends On

- `@owlmeans/web-client`, `@owlmeans/client-panel`, `@owlmeans/client-i18n`, `@owlmeans/web-router`, `@mui/material`, `react`, `react-router`
