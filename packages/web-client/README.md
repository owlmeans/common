# @owlmeans/web-client

Browser application bootstrap for OwlMeans: the web context factory (auth service, IndexedDB, the
default OwlMeans router and the login host already appended), the React mount helpers, the
framework entrypoint list (dispatcher, login surrogate) and the browser login plugins. An app uses
it directly when it renders its own UI and wants only the framework plumbing. An app that wants the
shadcn panel shell, forms, the styled sign-in screen and the socket reload prompt builds on
[`@owlmeans/web-panel`](../web-panel), whose `makeContext` composes this one. `@owlmeans/mui-panel`
is the legacy MUI layer — start nothing new there. React Native apps use the `native` monorepo.

## Installation

```bash
bun add @owlmeans/web-client@^0.1.18-rc.45
```

## Concepts

- **Web context** — `makeContext(cfg)` builds the page's one client context: `makeClientContext`,
  `extractPrimaryHost` (host and port from `window.location`), the web auth service
  (`context.auth()`), the IndexedDB service, the `AUTH_RESOURCE` client resource, the default router
  plugin from `@owlmeans/web-router`, and the login host (`context.login()`) with the redirect and
  surrogate plugins. An app factory calls it and appends its own idempotent `append*` mixins.
- **Framework entrypoints** — `entrypoints` is `@owlmeans/client-auth`'s list plus the
  `authProtocols.dispatcher` screen (`Dispatcher`) and the `authProtocols.surrogate` screen
  (`SurrogateScreen`). Every app spreads it into the one list it registers.
- **Dispatcher** — the return leg of authentication. It adopts a token carried in `AUTH_QUERY`,
  lets the login plugin `resume` an existing session, or renders the registered sign-in screen
  (`context.login().screen()`, falling back to `FallbackLoginScreen`). It never starts a flow itself.
- **Login plugins** — `makeRedirectLoginPlugin` (every ordinary tab, priority 0) and
  `makeSurrogateLoginPlugin` (a framed app or the surrogate window itself,
  `SURROGATE_LOGIN_PRIORITY`) decide *where* the sign-in round trip runs.
- **Session loss** — `appendWebAuthService` wraps every guarded backend entrypoint: an `AuthUnknown`
  ending in `:invalid` clears the token, and clearing the token sends the document to the
  dispatcher URL.
- **Global overlay slot** — `children` of `renderApp` / `WebApp` render inside the context provider
  and before the router, so a dialog or toast surface mounted there survives navigation.

## Usage

### 1. Config, types and the context factory

```ts
// src/types.ts
import type { AppConfig, AppContext } from '@owlmeans/web-client'

export interface Config extends AppConfig {}
export interface Context<C extends Config = Config> extends AppContext<C> {}
```

```ts
// src/config.ts
import { config } from '@owlmeans/web-client'
import { commonConfig, MY_APP_WEB } from 'my-app-common'
import type { Config } from './types.js'

export default config<Config>(MY_APP_WEB, commonConfig as Partial<Config>)
```

```ts
// src/context.ts
import { makeContext as makeWebContext, useContext as useWebContext } from '@owlmeans/web-client'
import { appendStateResource } from '@owlmeans/state'
import { PROJECT_STATE } from './consts.js'
import type { Config, Context } from './types.js'

export const useContext = (): Context => useWebContext<Config, Context>()

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  // Router, auth service, IndexedDB and the login host are already on the context.
  const context = makeWebContext<C, T>(cfg)
  appendStateResource<C, T>(context, PROJECT_STATE)

  return context
}
```

### 2. Shared screen declarations and the entrypoint list

Screens are declared once in the shared package, next to the API protocols:

```ts
// my-app-common/src/protocols/web.ts
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { BASE, HOME } from '@owlmeans/context'
import { openProtocol } from '@owlmeans/entrypoint'
import { frontend, route } from '@owlmeans/route'

const aliases = { projects: 'my-app-web:projects', project: 'my-app-web:project' } as const

const base = openProtocol(route(BASE, '/', frontend()))
const projects = openProtocol(route(aliases.projects, '/projects', frontend({ parent: base })), {
  guards: DEFAULT_GUARD,
})

export const webProtocols = {
  base,
  // A parent frontend route needs a `default: true` child, or it renders blank at its own path.
  home: openProtocol(route(HOME, '/', frontend({ parent: base, default: true }))),
  projects,
  project: openProtocol(route(aliases.project, '/:id', frontend({ parent: projects }))),
}
```

The browser binds the whole API tree and attaches a component to each screen:

```ts
// src/entrypoints.ts
import { bindAll, bindScreen, entrypoints as frameworkEntrypoints, handler } from '@owlmeans/web-client'
import { apiProtocols, webProtocols } from 'my-app-common'
import { PublicLayout } from './layout/public.js'
import { HomeScreen } from './screens/home.js'
import { ProjectsScreen } from './screens/projects.js'
import { ProjectScreen } from './screens/project.js'

export const appEntrypoints = [
  ...frameworkEntrypoints,
  ...bindAll(apiProtocols),
  bindScreen(webProtocols.base, handler(PublicLayout)),
  bindScreen(webProtocols.home, handler(HomeScreen)),
  bindScreen(webProtocols.projects, handler(ProjectsScreen)),
  bindScreen(webProtocols.project, handler(ProjectScreen)),
]
```

### 3. Boot

```tsx
// src/index.tsx
import './index.css'
import { renderApp } from '@owlmeans/web-client'
import { MY_APP_API, MY_APP_WEB } from 'my-app-common'
import config from './config.js'
import { makeContext } from './context.js'
import { appEntrypoints } from './entrypoints.js'
import { AppOverlays } from './components/overlays.js'

const context = makeContext(config)

// Before the first render: the router builds its route table once, from what is registered.
context.registerEntrypoints(appEntrypoints)
context.serviceRoute(MY_APP_WEB, true)
context.serviceRoute(MY_APP_API, true)

// The third argument is the global overlay slot — rendered above the router, never torn down.
renderApp(context, undefined, <AppOverlays />)
```

`renderApp(context, opts?, children?)` mounts `WebApp` (i18n provider, context provider, router)
into `#root` (`DEFAULT_ROOT`) once `DOMContentLoaded` fires. `RenderOptions` changes that:
`domId`, `onReady: false` (mount immediately), `hydrate: true` (`hydrateRoot` instead of
`createRoot`) and `debug`.

### 4. Calling protocols from a view model

```ts
// src/screens/project.vm.ts
import { EntrypointOutcome } from '@owlmeans/entrypoint'
import { apiProtocols, webProtocols } from 'my-app-common'
import type { Context } from '../types.js'

export const loadProject = async (ctx: Context, id: string) => {
  // Value only — an error in the reply is thrown.
  const project = await ctx.entrypoint(apiProtocols.project.get).call({ params: { id } })

  // Value plus outcome, when the outcome decides what happens next.
  const { value: slot, outcome } = await ctx.entrypoint(apiProtocols.project.slot)
    .invoke({ params: { id } })
  if (outcome !== EntrypointOutcome.Ok) {
    return { project, slot: null }
  }

  // A screen is addressed, never called.
  const shareUrl = await ctx.entrypoint(webProtocols.project).url({ params: { id } }, { absolute: true })

  return { project, slot, shareUrl }
}
```

### 5. File drop target

`Uploader` wraps `react-dropzone`; its props are `DropzoneOptions` plus an optional `Root`
component and `rootProps`. `ImageUploader` is the same control with `maxSize` defaulted to 5 MB.

```tsx
import type { FC } from 'react'
import { ImageUploader } from '@owlmeans/web-client'

export const LogoDrop: FC<{ onFile: (file: File) => void }> = ({ onFile }) =>
  <ImageUploader maxFiles={1} accept={{ 'image/*': [] }} onDrop={files => onFile(files[0])}>
    <span>Drop a logo here or click to choose one</span>
  </ImageUploader>
```

## API

### Context, rendering and services

| Symbol | Kind | Purpose |
|---|---|---|
| `makeContext<C, T>(cfg)` | function | Web context factory — see *Concepts* |
| `useContext<C, T>()` | hook | The current context, from React |
| `renderApp<C, T>(context, opts?, children?)` | function | Mount `WebApp` for a context; `children` are the global overlay slot |
| `render(node, opts?)` | function | Mount any React node with the same readiness, root and hydration handling |
| `WebApp` | component | `I18nContext` + `@owlmeans/client`'s `App` (context provider and router) |
| `RenderOptions` | type | `domId?`, `onReady?`, `hydrate?`, `debug?` |
| `AppConfig`, `AppContext` | type | Web config and context; the context carries `auth()` and `login()` |
| `DEFAULT_ROOT` | const | `'root'` — the default mount element id |
| `extractPrimaryHost(context)` | function | Copy `window.location` host and port into `cfg.primaryHost` / `cfg.primaryPort` |
| `makeAuthWebService(alias?)` | function | `@owlmeans/client-auth`'s service whose `update(undefined)` redirects to the dispatcher |
| `appendWebAuthService(ctx, alias?)` | function | Register that service, `authMiddleware` and the session-loss middleware; expose `context.auth()` |
| `provide` | const | Deprecated, always `undefined`; routing resolves its compiler from the active router plugin |
| `UploaderError`, `FileUploadingError` | class | Uploader errors registered with `ResilientError` |

### Entrypoints and authentication screens

| Symbol | Kind | Purpose |
|---|---|---|
| `entrypoints` | const | Framework bindings: client-auth's list, the dispatcher screen, the surrogate screen |
| `Dispatcher` | component | The dispatcher screen, built on `DispatcherHOC` |
| `parametriseDispatcher(defaults, Component?)` | function | A dispatcher with default props (`payload`, `alias`, ...) merged under the routed ones |
| `ParametrisedProps` | type | Routed entrypoint params plus `DispatcherProps` |
| `SurrogateScreen` | component | The screen the surrogate login window renders |
| `LoginSurrogateView`, `SurrogateStage`, `SurrogateViewProps` | component, enum, type | The surrogate window's status panel |
| `appendWebLogin(ctx)` | function | `appendLogin` plus the redirect and surrogate plugins |
| `makeRedirectLoginPlugin()`, `makeSurrogateLoginPlugin()` | function | The two shipped `LoginPlugin`s |
| `awaitSurrogate(...)` | function | The single waiter for a surrogate window's hand-back |
| `REDIRECT_LOGIN`, `SURROGATE_LOGIN`, `SURROGATE_LOGIN_PRIORITY` | const | Plugin aliases and the surrogate plugin's priority |

### Components

| Symbol | Kind | Purpose |
|---|---|---|
| `Uploader` | component | `react-dropzone` root with a hidden input |
| `ImageUploader` | component | `Uploader` with a 5 MB `maxSize` default |
| `UploaderProps`, `UploaderRootProps` | type | Uploader props |

### Re-exports

| Symbol | From |
|---|---|
| `handler` | `@owlmeans/client` |
| `config` | `@owlmeans/client-context` |
| `service` | `@owlmeans/config` |
| `AppType`, `HOME`, `ROOT`, `BASE`, `GUEST` | `@owlmeans/context` |
| `bind`, `bindAll`, `bindScreen`, `provideRequest`, `stab`; types `ClientEntrypoint`, `Module` | `@owlmeans/client-entrypoint` |
| `route`, `frontend` | `@owlmeans/route` |
| type `Route` (`ClientRoute`) | `@owlmeans/client-route` |

Importing the package also registers the `auth` library i18n namespace in all seven supported
languages.

## Common pitfalls

- **Register entrypoints before rendering.** The router builds its route table once, from the
  entrypoints the context knows about at mount.
- **Spread the framework `entrypoints`.** Without them there is no dispatcher and no surrogate
  screen, and `useLogin` throws `Entrypoint dispatcher not found`.
- **Bind every API declaration the browser calls, including route parents.** An unbound protocol
  throws "entrypoint not found" before any network call — `bindAll` over the whole tree avoids it.
- **A parent frontend route needs a `default: true` child**, or it renders blank at its own path.
- **Do not pass `provide`.** Routing comes from the router plugin (`@owlmeans/web-router` by
  default); react-router is only available through the opt-in `@owlmeans/web-router-react-router`.
- **Mount dialogs and toast surfaces in the overlay slot**, not inside a route — a dialog inside a
  route closes itself on the first navigation.
- **Use `renderApp`, not a hand-rolled `createRoot` in `StrictMode`.** The readiness handling is
  lost, and `StrictMode` double-invokes effects the router is not written for.
- **`onReady` waits for `DOMContentLoaded`.** A script that runs after the event has fired must pass
  `{ onReady: false }`, or nothing mounts.
- **One context per page, from one factory.** Build it with `makeContext` plus `append*` mixins;
  never create a second context for a component tree.

## Related packages

- [`@owlmeans/web-panel`](../web-panel) — shadcn/Tailwind panel layer built on this context
- [`@owlmeans/client-context`](../client-context) — `ClientContext` base extended by `makeContext`
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — protocol binding and `call` / `invoke` / `url`
- [`@owlmeans/client-auth`](../client-auth) — auth service, dispatcher HOC and login host
- [`@owlmeans/web-router`](../web-router) — default OwlMeans browser routing plugin
- [`@owlmeans/web-router-react-router`](../web-router-react-router) — opt-in react-router plugin
- [`@owlmeans/web-db`](../web-db) — IndexedDB service registered by `makeContext`
- [`@owlmeans/web-oidc-rp`](../web-oidc-rp) — OIDC relying party with its own dispatcher

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.33
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
