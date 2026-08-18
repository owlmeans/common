---
name: web-router-react-router
description: How to use @owlmeans/web-router-react-router — the opt-in React Router v7 routing plugin for OwlMeans (register with appendReactRouter to override the default OwlMeans browser router). Auto-invoked when using react-router with OwlMeans.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-router-react-router

**Layer:** Web (React), build level L2
**Install:** `"@owlmeans/web-router-react-router": "^0.1.18-rc.6"` in `dependencies`

The React Router v7 mechanic as an OwlMeans routing plugin. Extracted from the former `web-router`
so react-router is **opt-in**: OwlMeans in-browser routing is the default, and you add this plugin
only when you specifically want react-router.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendReactRouter(ctx)` | Register the react-router plugin on the router host (priority 100 → wins the cascade over the default). |
| `makeReactRouterPlugin()` | The `RouterPlugin` (alias `react-router`). `compile` = `createBrowserRouter`; provider/outlet/hooks from react-router. |
| Constants | `REACT_ROUTER`, `REACT_ROUTER_PRIORITY`. |

## Usage

```typescript
import { appendReactRouter } from '@owlmeans/web-router-react-router'

export const makeContext = (cfg) => {
  const context = makeBaseContext(cfg)   // registers the default OwlMeans browser plugin
  appendReactRouter(context)             // react-router now handles routing instead
  return context
}
```

Because it registers at priority 100 (above the default 0), calling `appendReactRouter` after the
default `appendWebRouter` makes react-router the active plugin via the cascade — no other changes
needed. Route descriptions are identical (same path placeholders), so route/entrypoint declarations
don't change.

## Depends On

- `@owlmeans/router` (host), `@owlmeans/context`
- peer `react`, `react-router@^7.9.6`

## Related

- [[router]] (host) · [[web-router]] (default OwlMeans plugin) · [[router-plugins]] (the plugin model)
