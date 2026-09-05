---
name: web-client
description: How to use @owlmeans/web-client — the browser entry point — makeContext(), renderApp(), elevate() to attach React components to entrypoint declarations, context.registerEntrypoints(), context.serviceRoute(), the dispatcher and surrogate login screens, and useAuthenticated(). Auto-invoked when working with a web app entry point, attaching React components to entrypoints, or wiring browser login.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-client

**Layer:** Web (React)
**Install:** `"@owlmeans/web-client": "^0.1.18-rc.24"` in `dependencies`

The browser layer over `@owlmeans/client`. It builds the context, mounts the app, and brings
working authentication with nothing registered by hand.

**What is here and what is not.** `@owlmeans/client` owns the React primitives and does not
re-export from here; this package owns the browser wiring and re-exports only the few authoring
helpers below. In particular `useNavigate`, `useEntrypoint`, `useStoreModel`, `useStoreList`,
`useValue` and `useToggle` are imported from `@owlmeans/client` even in a browser-only app.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeContext(cfg)` | Build the browser context: the client context plus the primary host, the auth service, web db, the auth client resource, the router and login |
| `AppConfig` / `AppContext` | The config and context types — `ClientContext` plus `auth()` and `login()` |
| `renderApp(context, opts?, children?)` | Mount the app. `children` render inside the provider and before the router — the global overlay slot |
| `render(node, opts?)` / `RenderOptions` | The bare mount: `{ domId, onReady, hydrate, debug }`, default root id `root` |
| `WebApp` | The mounted tree — the i18n provider around `App` from `@owlmeans/client` |
| `useContext()` | The context, typed as `AppContext` |
| `useAuthenticated()` | Whether this browsing context holds a session — it reports, it does not guard |
| `entrypoints` | The auth entrypoint list, with the dispatcher and the login-surrogate screens already elevated. Spread it into the app's own list |
| `Dispatcher` / `parametriseDispatcher(defaults, Com?)` | The post-login landing screen, and a wrapper that pre-fills its props |
| `Uploader` / `ImageUploader` / `UploaderProps` / `UploaderRootProps` | Dropzone-based file input; props are `react-dropzone`'s `DropzoneOptions` plus `Root`/`rootProps`. The image variant only DEFAULTS `maxSize` to 5 MB — pass `maxSize` to override it |
| `UploaderError` / `FileUploadingError` | Upload failures, on top of `ComponentError` |
| `appendWebLogin(ctx)` | Register the login host plus the redirect and surrogate-window plugins |
| `makeRedirectLoginPlugin()` / `makeSurrogateLoginPlugin()` / `awaitSurrogate(win, type, onMessage)` | The two browser login plugins and the window pump they share |
| `SurrogateScreen` / `LoginSurrogateView` / `SurrogateStage` / `SurrogateViewProps` | What the surrogate login window renders |
| `makeAuthWebService(alias?)` / `appendWebAuthService(ctx, alias?)` | The auth service whose `update(undefined)` leaves for the dispatcher. The append form also registers `authMiddleware` and the logout middleware |
| `extractPrimaryHost(ctx)` | Fill `cfg.primaryHost` / `primaryPort` from `window.location` |
| `DEFAULT_ROOT` (`root`), `REDIRECT_LOGIN`, `SURROGATE_LOGIN`, `SURROGATE_LOGIN_PRIORITY` (100) | Constants |

### Re-exported for authoring

`handler` (from `@owlmeans/client`); `entrypoint`, `elevate`, `provideRequest`, `stab` and the
`ClientEntrypoint` type (from `@owlmeans/client-entrypoint`); `route`, `frontend` (from
`@owlmeans/route`); `config` (from `@owlmeans/client-context`); `service` (from `@owlmeans/config`);
`AppType`, `HOME`, `ROOT`, `BASE`, `GUEST` (from `@owlmeans/context`). Import them from here so an
app's entrypoint file needs one import.

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

`serviceRoute(alias, makeDefault?)` marks a service's routing root; an alias `cfg.services` does not
carry throws a `SyntaxError` naming everything that is registered. Anything passed as `renderApp`'s
third argument mounts once, above routing, and survives navigation — which is where a consent
dialog or a toast surface belongs, since the same component inside a route is torn down and rebuilt
on every navigation and a dialog would close itself.

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

A guarded call whose session the server rejects logs the user out rather than surfacing the error
raw. `appendWebAuthService` registers a logout middleware for this — internal to the package, not
an import — which wraps `invoke` on every guarded backend entrypoint (that covers `call`, since
`call` reads `invoke` at the moment it runs), and an `AuthUnknown` ending in `:invalid` clears the
token, which through the web auth service leaves for the dispatcher.

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

The dispatcher and the surrogate screen are elevated on the auth entrypoint list this package
exports, so an app that spreads `entrypoints` into its own list gets both without an edit. The
surrogate screen renders `LoginSurrogateView` with plain elements and inline styles on purpose: it
runs in a popup opened by apps with entirely different stylesheets, none of which is loaded there.

An app that needs a different mechanic registers its own plugin at a higher priority after building
the base context (`context.login().registerPlugin(...)`); it never replaces these. The contract, the
cascade and the invariants are the [[login-plugins]] skill.

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

- `@owlmeans/client`, `@owlmeans/web-router` (default OwlMeans browser routing), `@owlmeans/web-db`
  (the IndexedDB store behind the client resources), `@owlmeans/client-i18n`
- `@owlmeans/client-auth` — `AUTH_RESOURCE`, the dispatcher HOC, and the `./login` host the browser
  plugins register on; `@owlmeans/auth`, `@owlmeans/auth-common`
- `@owlmeans/client-context`, `@owlmeans/client-entrypoint`, `@owlmeans/client-resource`,
  `@owlmeans/client-route`, `@owlmeans/route`, `@owlmeans/config`, `@owlmeans/context`,
  `@owlmeans/error`, `@owlmeans/i18n`, `react-dropzone`
- `@owlmeans/web-panel` and `@owlmeans/mui-panel` build **on** this package, not the other way
  round: a UI-family app imports the panel package and gets this one with it
- `react`, `react-dom` (peer). It does not depend on `react-router` — opt into it with
  `@owlmeans/web-router-react-router` (`appendReactRouter`). Routing needs no explicit provider:
  `PanelApp`/`App` compile through `context.router()`, so nothing passes a `provide` prop.

## Related

- [[client]] — the React primitives and the hooks this does not re-export
- [[login-plugins]] — the plugin cascade the two browser plugins take part in
- [[web-router]] — the routing this context registers
