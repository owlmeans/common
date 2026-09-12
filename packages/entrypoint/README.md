# @owlmeans/entrypoint

Entrypoint protocol system — the typed route contract shared between server and client in OwlMeans apps.

## Overview

- A **protocol** is one immutable URL unit: an alias + route + typed contract + access options
- On the server and client, corresponding bindings add handlers, screens or calls to that protocol
- All AJV validation schemas live at protocol level, keeping data contracts consistent fullstack
- Most commonly used with `@owlmeans/server-entrypoint` and `@owlmeans/client-entrypoint`

The route declaration an entrypoint carries is immutable: its `path` always stays the segment this
entrypoint contributes under its parent. Addresses are computed on demand against the context the
entrypoint is registered in — `path()` walks the parent chain, `mount()` adds the service base,
`address()` picks host, port and scheme — so one declaration answers correctly on both sides.

## Installation

```bash
bun add @owlmeans/entrypoint@^0.1.18-rc.19
```

## Usage

Define a protocol with a typed request and guard:

```typescript
import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'

const aliases = { stories: 'stories', create: 'stories:create' } as const
const stories = openProtocol(route(aliases.stories, '/stories', backend()))

export const storyProtocols = {
  base: stories,
  create: protocol(
    route(aliases.create, '/', backend({ parent: stories, method: RouteMethod.POST })),
    contract.request({ body: typed<CreateStory>(CreateStorySchema) }, typed<Story>()),
    { guards: ['authenticated'] },
  ),
} as const
```

Bind the protocol to a typed server handler:

```typescript
import { handlers } from '@owlmeans/server-api'
import { bind } from '@owlmeans/server-entrypoint'
import type { Context } from 'my-app-backend'

const api = handlers<Context>()
const create = api.body(storyProtocols.create, async (body, context) =>
  context.story().create(body))
export const serverBindings = [
  bind(storyProtocols.base),
  bind(storyProtocols.create, create),
]
```

## API

### `protocol(route, contract, options?): EntrypointProtocol`

Creates an immutable typed protocol declaration.

### `openProtocol(route, options?): EntrypointProtocol`

Creates an intentionally untyped protocol, used only for framework escape hatches.

### `contract(...)`, `contract.request(...)`, `typed<T>(schema?)`

Describe typed body, params, query, headers and response sections.

Access is declared directly in `EntrypointOptions` as `guards`, `gate` and `sticky`; runtime
behaviour is added by `bind()`/`bindAll()`/`bindScreen()` in the side-specific package.

### Parentship

A child references its parent protocol in the route declaration
(`route(alias, '/', backend({ parent: storyProtocols.base }))`). `path()` prefixes the parent's
segments, and inherited guards/gates are collected when a runtime binds the protocol. Keep aliases
private to the declaration module; an alias string is an adapter address, not a cross-layer API.

### `provideResponse<T>(): AbstractResponse<T>`

Creates a response object for use in unbound handlers.

### Transport

A route's protocol picks the carrier. Register a service under `transportAlias(protocol)` —
`transport:<protocol>` — implementing `EntrypointTransport { protocol, handle }`, and every call to
an entrypoint on that protocol goes through it. A consumer writes `ep.call(...)` and never learns
whether that became an HTTP request, a socket message or a queued job. Without a registered
transport the call goes over HTTP.

### `EntrypointOutcome`

```typescript
enum EntrypointOutcome { Ok, Accepted, Created, Finished }
```

### Types

- `AbstractRequest<T>` — request with `params`, `body`, `query`, `headers`, `auth`
- `AbstractResponse<T>` — response with `resolve(value, outcome?)` and `reject(error)`
- `CommonEntrypoint` — entrypoint with `alias`, `route`, `handle`, and the context-computed
  `segment()`, `path()`, `mount()`, `service()`, `address()`, `isLocal()`, `parent()`,
  `getGuards()`, `getGates()`
- `EntrypointTransport` — `{ protocol, handle }`, the service that carries a call for one protocol

## Related Packages

- [`@owlmeans/route`](../route) — `route()` factory used in `protocol(route(...), ... )`
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — server-side `bind()`/`bindAll()` to attach handlers
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — client-side entrypoint with API call support
- [`@owlmeans/server-app`](../server-app) — re-exports everything from this package

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.20
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
