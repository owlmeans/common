---
name: web-client
description: How to use @owlmeans/web-client — browser entry point with renderApp(), elevate() to attach React components to entrypoint declarations, context.registerEntrypoints() and context.serviceRoute() for routing. Auto-invoked when working with the web app entry point or attaching React components to entrypoints.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-client

**Layer:** Web (React)
**Install:** `"@owlmeans/web-client": "^0.1.18-rc.24"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `renderApp<C, T>(context)` | Mount the React app (routing via the active router plugin — OwlMeans by default) |
| `elevate(entrypoints, alias, handler?)` | Attach a React component (`handler(Component)`) to an entrypoint, or opt a backend alias into client-side calling |
| `entrypoint(route, handler?)` | Build a client entrypoint from a route declaration |
| `handler(Component)` | Wrap a React component as an entrypoint handler |
| `context.registerEntrypoints(entrypoints)` | Register the full entrypoint list on the context |
| `context.serviceRoute(alias, isDefault?)` | Mark a service's routing root |
| `makeContext(cfg)` | Build the browser context — auth, web db, client resource, router and login are all appended here |
| `appendWebLogin(context)` | Register the login host plus the redirect and surrogate-window plugins |
| `useAuthenticated()` | Whether this browsing context holds a session — it reports, it does not guard |
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

`elevate` is idempotent — it replaces the declaration in the list, so re-elevating an alias (a
screen swapped for a variant build, a guard added to an already-elevated one) is allowed, and
guards named at elevation are unioned with the declared ones rather than replacing them. A backend
alias takes no handler at all: giving one is a wiring error and throws.

A **backend** alias the client calls needs a bare `elevate(entrypoints, alias)` — no handler. That
opts the alias into client-side callability, so:

```typescript
const project = await context.entrypoint<ClientEntrypoint<Project>>(alias)
  .call({ params, body, query })                       // the value; the reply's error is thrown
const { value, outcome } = await context.entrypoint<ClientEntrypoint<Project>>(alias)
  .invoke({ params })                                  // when the outcome decides what happens next
const href = await context.entrypoint<ClientEntrypoint<Project>>(alias)
  .url({ params }, { absolute: true })                 // the address, not the round trip
```

The auth header is attached automatically for guarded entrypoints. An entrypoint that renders a
screen answers `url()` and throws from `call()`/`invoke()` — a screen is navigated to, not called.

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

### Reading auth state

```ts
import { useAuthenticated } from '@owlmeans/web-client'

const authenticated = useAuthenticated()   // false until the check settles
```

`useAuthenticated()` asks `context.auth().authenticated()` — the one channel the dispatcher and the
login screen already read, answering from the auth service's token or rehydrating it from the auth
resource. It is what a header uses to choose between the "Log in" and "Log out" control; nothing
about it navigates, and it does not re-check, because both ways out of its answer replace the
document.

**It reports; it does not guard.** The guard is `useSelfAuth` from `@owlmeans/client-auth`, which
sends an anonymous visitor to the dispatcher and defaults to doing so — the wrong behaviour for a
component that only wants to know which control to draw. An application declares neither hook
itself.

### Navigation
```typescript
import { useNavigate } from '@owlmeans/client'   // not re-exported by web-client
import { useStoreList, useStoreModel } from '@owlmeans/client'   // client state — also not re-exported

const nav = useNavigate()
<Button onClick={nav.press(manager.front.project.dashboard, { params: { projectId } })}>Open</Button>
await nav.go(alias, { params })   // programmatic; nav.back() to go back
```

The navigator resolves its target through the entrypoint's own `url(request)`, so a screen names an
alias and never assembles a path. Render a plain `<a href>` the same way — `await
context.entrypoint(alias).url({ params })`, or the `Link` component from `@owlmeans/web-panel`,
which does it for you.

## Depends On

- `@owlmeans/client`, `@owlmeans/web-router` (default OwlMeans browser routing), `@owlmeans/web-panel` (typically), `@owlmeans/client-i18n`
- `@owlmeans/client-auth` — `AUTH_RESOURCE` and the `./login` host the browser plugins register on
- `@owlmeans/entrypoint`, `@owlmeans/route`
- `react`, `react-dom` (peer). It does not depend on `react-router` — opt into it with
  `@owlmeans/web-router-react-router` (`appendReactRouter`). Routing needs no explicit provider:
  `PanelApp`/`App` compile through `context.router()`, so nothing passes a `provide` prop.
