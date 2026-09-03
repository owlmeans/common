# @owlmeans/web-client

React web application bootstrap — context factory, entrypoint/routing utilities, and app renderer for OwlMeans web apps.

## Overview

- `makeContext(cfg)` — creates the web application context (includes auth, router, and DB services)
- `renderApp(context)` — mounts the React app to the DOM
- Re-exports entrypoint/routing helpers: `entrypoint`, `route`, `frontend`, `handler`, `elevate`
- Re-exports route constants: `BASE`, `HOME`, `ROOT`, `GUEST`
- `entrypoints` — the base client entrypoints (dispatcher, login surrogate) every web app spreads
- `ClientEntrypoint<T>` (also exported as `Module<T>`) — the typed entrypoint interface behind
  `call()` / `invoke()` / `url()`

## Installation

```bash
bun add @owlmeans/web-client@^0.1.18-rc.23
```

## Usage

Bootstrap the app:

```typescript
import { makeContext, renderApp } from '@owlmeans/web-client'

const context = makeContext(config)
context.registerEntrypoints(appEntrypoints)
context.serviceRoute(MANAGER, true)
renderApp<Config, Context>(context)
```

Define entrypoints:

```typescript
import { BASE, HOME, elevate, entrypoint, frontend, handler, route } from '@owlmeans/web-client'

appEntrypoints.push(entrypoint(route(BASE, '/', frontend()), handler(PublicLayout)))
appEntrypoints.push(entrypoint(route(HOME, '/', frontend({ default: true, parent: BASE })), handler(HomeScreen)))
elevate(appEntrypoints, manager.back.account.base)
```

A screen entrypoint carries a renderer, so it is addressed by `url()` and never called over the
wire. Call an API entrypoint from a component:

```typescript
import type { ClientEntrypoint } from '@owlmeans/web-client'

const result = await context.entrypoint<ClientEntrypoint<MyType>>(alias)
  .call({ params: { id }, body: data })
```

## API

### `makeContext<C, T>(cfg): T`

Creates a web app context. Automatically registers web router, IndexedDB, and auth services.

### `renderApp<C, T>(context): void`

Renders the React application to the DOM using the provided context.

### `useContext<C, T>(): T`

React hook to access the current application context.

### `makeAuthWebService(alias?)`, `appendWebAuthService(ctx, alias?)`

Auth service factory and appender — adds logout redirect handling for web environments.

### `Dispatcher`

Component that handles authentication routing (redirect to login, etc.).

## Related Packages

- [`@owlmeans/client-context`](../client-context) — `ClientContext` base extended by `makeContext`
- [`@owlmeans/web-router`](../web-router) — default OwlMeans browser routing plugin registered by `makeContext`
- [`@owlmeans/web-db`](../web-db) — IndexedDB service registered by `makeContext`
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — the `ClientEntrypoint<T>` implementation

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
