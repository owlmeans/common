# @owlmeans/web-client

React web application bootstrap — context factory, module/routing utilities, and app renderer for OwlMeans web apps.

## Overview

- `makeContext(cfg)` — creates the web application context (includes auth, router, and DB services)
- `renderApp(context)` — mounts the React app to the DOM
- Re-exports module/routing helpers: `module`, `route`, `frontend`, `handler`, `elevate`
- Re-exports route constants: `BASE`, `HOME`, `ROOT`, `GUEST`
- `Module<T>` — typed client module interface for `.call()` API requests

## Installation

```bash
bun add @owlmeans/web-client
```

## Usage

Bootstrap the app:

```typescript
import { makeContext, renderApp } from '@owlmeans/web-client'

const context = makeContext(config)
context.registerModules(appModules)
context.serviceRoute(MANAGER, true)
renderApp<Config, Context>(context)
```

Define modules:

```typescript
import { BASE, HOME, elevate, frontend, handler, module, route } from '@owlmeans/web-client'

modules.push(module(route(BASE, '/', frontend()), handler(PublicLayout)))
modules.push(module(route(HOME, '/', frontend({ default: true, parent: BASE })), handler(HomeScreen)))
elevate(modules, manager.back.account.base)
```

Call an API module from a component:

```typescript
import type { Module } from '@owlmeans/web-client'

const [result] = await context.module<Module<MyType>>(moduleAlias)
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
- [`@owlmeans/client-module`](../client-module) — `ClientModule<T>` / `Module<T>` implementation

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
