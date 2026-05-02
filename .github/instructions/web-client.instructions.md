---
description: "How to use @owlmeans/web-client — browser entry point with renderApp(), elevate() to attach React components to module declarations, context.registerModules() and context.serviceRoute() for routing."
applyTo: "**/index.tsx, **/modules.ts, **/modules.tsx, **/*.ts, **/*.tsx"
---

# @owlmeans/web-client

**Layer:** Web (React)
**Install:** `"@owlmeans/web-client": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `renderApp<C, T>(context)` | Mount React app with React Router 7 |
| `elevate(modules, alias, handler)` | Attach a React component to a module |
| `handler(Component)` | Wrap a React component as a module handler |
| `context.registerModules(modules)` | Register modules on the context |
| `context.serviceRoute(alias, isDefault?)` | Mark a service's routing root |
| `router`, `components`, `service`, `i18n`, `helpers`, `errors` | Web helpers |
| Constants | Default aliases |

## Usage

```typescript
// index.tsx
import { renderApp } from '@owlmeans/web-client'
const context = makeContext(config)
context.registerModules(appModules)
context.serviceRoute(MANAGER, true)
renderApp<Config, Context>(context)

// modules.ts
import { elevate, route, frontend, handler, module } from '@owlmeans/web-client'
elevate(modules, manager.front.project.dashboard, handler(ProjectDashboardScreen))
modules.push(module(route(HOME, '/', frontend({ default: true })), handler(HomeScreen)))
```

## Depends On

- `@owlmeans/client`, `@owlmeans/web-router`, `@owlmeans/web-panel`, `@owlmeans/client-i18n`, `@owlmeans/module`, `@owlmeans/route`, `react`, `react-dom`, `react-router`
