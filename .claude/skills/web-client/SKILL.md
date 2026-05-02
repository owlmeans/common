---
name: web-client
description: How to use @owlmeans/web-client — browser entry point with renderApp(), elevate() to attach React components to module declarations, context.registerModules() and context.serviceRoute() for routing. Auto-invoked when working with the web app entry point or attaching React components to modules.
user-invocable: false
---

# @owlmeans/web-client

**Layer:** Web (React)
**Install:** `"@owlmeans/web-client": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `renderApp<C, T>(context)` | Mount the React app with React Router 7 |
| `elevate(modules, alias, handler)` | Attach a React component (or `handler(Component)`) to a module |
| `handler(Component)` | Wrap a React component as a module handler |
| `context.registerModules(modules)` | Register the full module list on the context |
| `context.serviceRoute(alias, isDefault?)` | Mark a service's routing root |
| `router`, `components`, `service`, `i18n`, `helpers`, `errors` | Web-specific helpers |
| Constants | Default aliases (BASE, HOME) |

## Usage

### Entry point
```typescript
// index.tsx
import { renderApp } from '@owlmeans/web-client'
import { makeContext } from './context.js'
import { appModules } from './modules.js'
import { MANAGER, MANAGER_API } from 'my-common'
import config from './config.js'

const context = makeContext(config)
context.registerModules(appModules)
context.serviceRoute(MANAGER, true)
context.serviceRoute(MANAGER_API, true)
renderApp<Config, Context>(context)
```

### Module elevation with React components
```typescript
import { elevate, route, frontend, handler, module, guard } from '@owlmeans/web-client'
import { HomeScreen, ProjectDashboardScreen } from './screens/index.js'

elevate(modules, manager.front.project.dashboard, handler(ProjectDashboardScreen))

modules.push(
  module(route(HOME, '/', frontend({ default: true, parent: BASE })), handler(HomeScreen))
)
```

## Depends On

- `@owlmeans/client`, `@owlmeans/web-router`, `@owlmeans/web-panel` (typically), `@owlmeans/client-i18n`
- `@owlmeans/module`, `@owlmeans/route`
- `react`, `react-dom`, `react-router` (peer)
