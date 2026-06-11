---
description: "How to use @owlmeans/web-client — browser entry point with renderApp(), elevate() to attach React components to entrypoint declarations, context.registerEntrypoints() and context.serviceRoute() for routing."
applyTo: "**/index.tsx, **/modules.ts, **/modules.tsx, **/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-client

**Layer:** Web (React)
**Install:** `"@owlmeans/web-client": "^0.1.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `renderApp<C, T>(context)` | Mount React app with React Router 7 |
| `elevate(modules, alias, handler)` | Attach a React component to an entrypoint |
| `handler(Component)` | Wrap a React component as an entrypoint handler |
| `context.registerEntrypoints(modules)` | Register entrypoints on the context |
| `context.serviceRoute(alias, isDefault?)` | Mark a service's routing root |
| `router`, `components`, `service`, `i18n`, `helpers`, `errors` | Web helpers |
| Constants | Default aliases |

## Usage

```typescript
// index.tsx
import { renderApp } from '@owlmeans/web-client'
const context = makeContext(config)
context.registerEntrypoints(appModules)
context.serviceRoute(MANAGER, true)
renderApp<Config, Context>(context)

// modules.ts
import { elevate, route, frontend, handler, entrypoint } from '@owlmeans/web-client'
elevate(modules, manager.front.project.dashboard, handler(ProjectDashboardScreen))
modules.push(entrypoint(route(HOME, '/', frontend({ default: true })), handler(HomeScreen)))
```

## Depends On

- `@owlmeans/client`, `@owlmeans/web-router`, `@owlmeans/web-panel`, `@owlmeans/client-i18n`, `@owlmeans/entrypoint`, `@owlmeans/route`, `react`, `react-dom`, `react-router`
