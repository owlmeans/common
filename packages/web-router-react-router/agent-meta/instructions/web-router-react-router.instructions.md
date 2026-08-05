---
description: "How to use @owlmeans/web-router-react-router — the opt-in React Router v7 routing plugin for OwlMeans. Use when an app should route with react-router instead of the default OwlMeans browser router."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-router-react-router

**Layer:** Web (React), L2
**Install:** `"@owlmeans/web-router-react-router": "^0.1.14"` in `dependencies`

React Router v7 as an OwlMeans routing plugin, extracted from the former `web-router` so react-router
is opt-in. OwlMeans in-browser routing is the default.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendReactRouter(ctx)` | Register the react-router plugin (priority 100 → wins the cascade). |
| `makeReactRouterPlugin()` | The `RouterPlugin` (alias `react-router`); `compile` = `createBrowserRouter`. |
| `REACT_ROUTER`, `REACT_ROUTER_PRIORITY` | Constants. |

## Usage

```typescript
import { appendReactRouter } from '@owlmeans/web-router-react-router'
export const makeContext = (cfg) => { const c = makeBaseContext(cfg); appendReactRouter(c); return c }
```

Route/entrypoint declarations don't change — path descriptions are identical.

## Depends On

- `@owlmeans/router`, `@owlmeans/context`; peer `react`, `react-router@^7.9.6`
