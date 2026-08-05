---
description: "How to use @owlmeans/server-app — main() entry point, handleRequest()/handleBody() handler wrappers, elevate()/celevate() to attach handlers to module declarations, sservice() to register backend services."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-app

**Layer:** Server
**Install:** `"@owlmeans/server-app": "^0.1.14"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `main<E, C, T>(context, modules)` | Entry point — boots Express, registers entrypoints |
| `handleRequest(fn)` | Wrap a server handler `(req, context) => result` |
| `handleBody<T>(fn)` | Wrap with validated body — `(payload, context, req) => result` |
| `elevate(modules, alias, handler)` | Attach handler to an entrypoint declaration |
| `celevate(modules, alias, handler)` | Conditional elevate |
| `sservice(options, cfg)` | Register a server-side service in the config |
| `modules` | Built-in system entrypoints to spread |
| `Context`, `Config`, `ClientEntrypoint` re-exports | Common types |

## Usage

```typescript
// index.ts
import { main } from '@owlmeans/server-app'
const context = makeContext(config)
main<{}, Config, Context>(context, appModules)

// Handlers
import { handleRequest, handleBody } from '@owlmeans/server-app'
export const list = handleRequest(async (req, context) => {
  if (req.auth?.entityId == null) throw new AuthUnknown('entity')
  return await (context as Context).project().list({ entityId: req.auth.entityId })
})

// Elevation
import { elevate, modules } from '@owlmeans/server-app'
elevate(managerModules, manager.back.project.create, create)
export const appModules = [...modules, ...managerModules]
```

## Depends On

- `@owlmeans/server-context`, `@owlmeans/server-entrypoint`, `@owlmeans/server-route`, `@owlmeans/server-api`
- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/auth`, `@owlmeans/error`
