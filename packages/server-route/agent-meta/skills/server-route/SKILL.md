---
name: server-route
description: How to use @owlmeans/server-route — wrapping a route model for server use, matching a request against a mounted path, and the ServiceRoute config shape. Auto-invoked when importing server-route helpers.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-route

**Layer:** Server
**Install:** `"@owlmeans/server-route": "^0.1.18-rc.9"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `route(model, intermediate, opts?)` | Wrap a route model for server use |
| `ServerRouteModel<R>` | `{ route, match(request, mount), isIntermediate() }` |
| `ServerRoute` | A declaration plus `internalHost`, `internalPort`, `opened` |
| `ServiceRoute` | A service config entry with the same server extras — what `cfg.services` holds |
| `ServerRouteOptions<R>` | `{ overrides, pathField, match }` — defaults, the request field holding the path, a custom matcher |
| `isServerRouteModel(obj)` | The `isIntermediate` marker test |
| `WILDCARD` (`*`), `DEFAULT_FIELD` (`url`) | Matching constants |

## Matching

`match(request, mount)` takes the **mounted path from the caller**: a declaration knows only the
segment it contributes, so composing the rest takes the context the entrypoint is attached to. A
server therefore always asks the entrypoint first and passes the answer in:

```typescript
entrypoint.route.match(request, entrypoint.mount())
```

The matcher behind it walks the template segment by segment, collecting `:params`, honouring
`WILDCARD`, and reporting a partial hit when the path outruns the template. An **intermediate**
route accepts a partial match — that is what makes it a group other routes hang under; a leaf
requires a full one. Read the path from a different request field with `pathField`, or replace the
whole test with `opts.match`.

## Usage

This package is typically used internally by `@owlmeans/server-app` and `@owlmeans/server-entrypoint`. Import directly only for custom routing.

```typescript
import { route as broute } from '@owlmeans/server-route'

const model = broute(declaration, true, { pathField: 'url' })
```

## Depends On

- `@owlmeans/route`, `@owlmeans/context`
