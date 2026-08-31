---
name: web-client
description: How to use @owlmeans/web-client — browser entry point with renderApp(), elevate() to attach React components to entrypoint declarations, context.registerEntrypoints() and context.serviceRoute() for routing. Auto-invoked when working with the web app entry point or attaching React components to entrypoints.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-client

**Layer:** Web (React)
**Install:** `"@owlmeans/web-client": "^0.1.18-rc.13"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `renderApp<C, T>(context)` | Mount the React app (routing via the active router plugin — OwlMeans by default) |
| `elevate(entrypoints, alias, handler)` | Attach a React component (or `handler(Component)`) to an entrypoint |
| `handler(Component)` | Wrap a React component as an entrypoint handler |
| `context.registerEntrypoints(entrypoints)` | Register the full entrypoint list on the context |
| `context.serviceRoute(alias, isDefault?)` | Mark a service's routing root |
| `makeContext(cfg)` | Build the browser context — auth, web db, client resource, router and login are all appended here |
| `appendWebLogin(context)` | Register the login host plus the redirect and surrogate-window plugins |
| `router`, `components`, `service`, `i18n`, `helpers`, `errors` | Web-specific helpers |
| Constants | Default aliases (BASE, HOME), `REDIRECT_LOGIN`, `SURROGATE_LOGIN` |

## Usage

### Entry point
```typescript
// index.tsx
import { renderApp } from '@owlmeans/web-client'
import { makeContext } from './context.js'
import { appEntrypoints } from './entrypoints.js'
import { MANAGER, MANAGER_API } from 'my-common'
import config from './config.js'

const context = makeContext(config)
context.registerEntrypoints(appEntrypoints)
context.serviceRoute(MANAGER, true)
context.serviceRoute(MANAGER_API, true)
renderApp<Config, Context>(context)
```

### Entrypoint elevation with React components
```typescript
import { elevate, route, frontend, handler, entrypoint } from '@owlmeans/web-client'
import { HomeScreen, ProjectDashboardScreen } from './screens/index.js'

elevate(entrypoints, manager.front.project.dashboard, handler(ProjectDashboardScreen))

entrypoints.push(
  entrypoint(route(HOME, '/', frontend({ default: true, parent: BASE })), handler(HomeScreen))
)
```

A **backend** alias the client calls needs a bare `elevate(entrypoints, alias)` — no handler. That
makes `context.entrypoint<ClientEntrypoint<T>>(alias).call({ params, body, query })` work; the auth
header is attached automatically for guarded entrypoints.

### Login comes with the context

`makeContext` calls `appendWebLogin`, which registers the login host (`@owlmeans/client-auth/login`)
and both browser plugins on it — redirect (`REDIRECT_LOGIN`, priority 0, applies always) and
surrogate window (`SURROGATE_LOGIN`, priority 100, applies in a frame or in the surrogate itself).
So every web app — and everything built on `web-panel` or `mui-panel` — has working sign-in,
including from an embedded app, with nothing registered by hand:

```typescript
import { useLogin, useLogout } from '@owlmeans/client-auth/login'

const [, onLogIn] = useLogin()   // one control, one handler, no environment checks
```

An app that needs a different mechanic registers its own plugin at a higher priority after building
the base context (`context.login().registerPlugin(...)`); it never replaces these. The contract, the
cascade and the invariants are the `login-plugins` skill.

### Navigation
```typescript
import { useNavigate } from '@owlmeans/client'   // not re-exported by web-client
import { useStoreList, useStoreModel } from '@owlmeans/client'   // client state — also not re-exported

const nav = useNavigate()
<Button onClick={nav.press(manager.front.project.dashboard, { params: { projectId } })}>Open</Button>
await nav.go(alias, { params })   // programmatic; nav.back() to go back
```

## Depends On

- `@owlmeans/client`, `@owlmeans/web-router` (default OwlMeans browser routing), `@owlmeans/web-panel` (typically), `@owlmeans/client-i18n`
- `@owlmeans/client-auth` — `AUTH_RESOURCE` and the `./login` host the browser plugins register on
- `@owlmeans/entrypoint`, `@owlmeans/route`
- `react`, `react-dom` (peer). No longer depends on `react-router` — opt into it with `@owlmeans/web-router-react-router` (`appendReactRouter`). The former `provide` export is a deprecated `undefined`.
