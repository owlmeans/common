---
name: client-route
description: How to use @owlmeans/client-route — marking a route model as client-side and extracting its :params. Auto-invoked when importing client route helpers.
user-invocable: false
---

# @owlmeans/client-route

**Layer:** Client
**Install:** `"@owlmeans/client-route": "^0.1.18-rc.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `route(model, opts?)` | Mark a route model as a client one, filling in whatever the declaration left blank |
| `ClientRouteModel` | A `RouteModel` carrying the `_client: true` marker |
| `ClientRoute` | The declaration a client route wraps |
| `ClientRouteOptions` | `{ overrides }` — defaults applied to blank declaration fields |
| `isClientRouteModel(obj)` | The `_client` marker test |
| `extractParams(path)` | The `:param` names a path declares, in order |

## Usage

Most app code uses route declarations from `@owlmeans/route` and lets `@owlmeans/web-router` consume them. Import here only for custom routing.

```typescript
import { route, extractParams } from '@owlmeans/client-route'

const model = route(declaration, { overrides: { service: 'manager' } })
extractParams('/project/:id/task/:taskId')   // ['id', 'taskId']
```

Marking is all this does: the declared `path` stays the **segment** the route contributes, and the
full path, mount and address are computed by the entrypoint against the context that asks. Nothing
here rewrites a declaration — `overrides` only fills fields the declaration left blank.

## Depends On

- `@owlmeans/route` — `RouteModel`, `overrideParams` (from `/utils`), `normalizePath`, `SEP`, `PARAM`
- `@owlmeans/client-context`
