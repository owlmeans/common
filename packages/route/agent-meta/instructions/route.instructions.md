---
description: "How to use @owlmeans/route — route() helper for declaring URL paths, frontend() marker for React routes, RouteMethod enum. Use when defining a module's URL path."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/route

**Layer:** Core
**Install:** `"@owlmeans/route": "^0.1.10"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `route(alias, path, options?)` | Define a route — path relative to `parent` |
| `frontend(options?)` | Mark a route as a React page |
| `RouteMethod` | enum: GET, POST, PUT, DELETE, PATCH |
| `Route` types | Resolved route shape |
| Constants | Default route aliases |

## Subpath Exports

- `./utils` — path manipulation helpers

## Usage

```typescript
import { route, frontend, RouteMethod } from '@owlmeans/route'

route(manager.back.project.create, '/create', {
  parent: manager.back.project.base,
  method: RouteMethod.POST,
})

route(HOME, '/', frontend({ default: true, parent: BASE }))
```

## Depends On

- `@owlmeans/error`, `@owlmeans/i18n`
