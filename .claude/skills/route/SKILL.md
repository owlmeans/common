---
name: route
description: How to use @owlmeans/route — route() helper for declaring URL paths, frontend() marker for React routes, RouteMethod enum, and route model types. Auto-invoked when importing route helpers or defining a module's URL path.
user-invocable: false
---

# @owlmeans/route

**Layer:** Core
**Install:** `"@owlmeans/route": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `route(alias, path, options?)` | Define a route — path is relative to `parent` |
| `frontend(options?)` | Mark a route as a React page (web only) |
| `RouteMethod` | enum of GET, POST, PUT, DELETE, PATCH |
| `Route` types | Resolved route shape |
| Constants | Default route aliases |

## Subpath Exports

- `./utils` — path manipulation helpers

## Usage

```typescript
import { route, frontend, RouteMethod } from '@owlmeans/route'
import { module } from '@owlmeans/module'

// Server route
module(
  route(manager.back.project.create, '/create', {
    parent: manager.back.project.base,
    method: RouteMethod.POST,
  })
)

// Web route — frontend() marks it as a React page
module(
  route(HOME, '/', frontend({ default: true, parent: BASE }))
)
```

## Depends On

- `@owlmeans/error` — route errors
- `@owlmeans/i18n` — translatable errors
