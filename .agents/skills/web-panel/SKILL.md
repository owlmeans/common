---
name: web-panel
description: How to use @owlmeans/web-panel — base browser context factory (makeContext) with Material-UI + React Router 7 wired in, plus form/panel components. Auto-invoked when building a web app's makeContext or importing web panel components.
user-invocable: false
---

# @owlmeans/web-panel

**Layer:** Web (React)
**Install:** `"@owlmeans/web-panel": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeContext<C, T>(cfg)` | Base web context factory (MUI + React Router) |
| `components` submodule | Material-UI panel/form components |
| Re-exports from `@owlmeans/client-panel` | Cross-platform panel primitives |
| `main`, `exports`, `context`, `modules`, `types` | Wiring helpers |

## Subpath Exports

- `./auth` — auth panel components for web
- `./auth/modules` — auth panel module declarations

## Usage

### In `context.ts`
```typescript
import { makeContext as makeBasicContext } from '@owlmeans/web-panel'
import { appendOidcGuard } from '@owlmeans/web-oidc-rp'
import { appendStateResource } from '@owlmeans/state'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  appendOidcGuard<C, T>(context)
  appendStateResource<C, T>(context, VIB_PROJECT_STATE)
  context.makeContext = makeContext as typeof context.makeContext
  return context
}
```

## Depends On

- `@owlmeans/web-client`, `@owlmeans/client-panel`, `@owlmeans/client-i18n`, `@owlmeans/web-router`
- `@mui/material`, `react`, `react-router` (peer)
