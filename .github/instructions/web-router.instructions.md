---
description: "How to use @owlmeans/web-router — the DEFAULT OwlMeans in-browser routing plugin (History API + pure matcher + React provider/outlet/hooks). Use when wiring web routing."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/web-router

**Layer:** Web (React), L2
**Install:** `"@owlmeans/web-router": "^0.1.11"` in `dependencies`

The **default OwlMeans in-browser router** — react-router-free standard URL routing over the
History API, registered as a `RouterPlugin` on the `@owlmeans/router` host. (react-router now lives
in the opt-in `@owlmeans/web-router-react-router`.)

## Key Exports

| Export | Description |
|--------|-------------|
| `appendWebRouter(ctx)` | Register the OwlMeans browser plugin (idempotent). Called transparently by `web-client`. |
| `makeBrowserRouterPlugin()` | The `RouterPlugin` (alias `owlmeans-browser-router`, priority 0). |
| `BrowserRouterProvider`, `Outlet`, hooks, `createBrowserHistory()` | React pieces + history wrapper. |

## Usage

```typescript
import { appendWebRouter } from '@owlmeans/web-router'
appendWebRouter(context)  // default OwlMeans routing
```

Supported route syntax: static, `:param`, nested, index. To use react-router instead, call
`appendReactRouter(ctx)` from `@owlmeans/web-router-react-router` (its higher priority wins).

## Depends On

- `@owlmeans/router`, `@owlmeans/context`; peer `react` (no react-router)
