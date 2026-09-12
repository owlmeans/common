# @owlmeans/server-entrypoint

Server-side entrypoint system: binds shared protocol declarations to request handlers.

## Overview

- `bind(protocol, handler?, opts?)` materializes one immutable protocol with its handler
- `bindAll(protocols, handlers?)` materializes a declaration collection
- Used by `@owlmeans/server-app` when assembling a server context

## Installation

```bash
bun add @owlmeans/server-entrypoint@^0.1.18-rc.10
```

## Usage

Typical pattern — declare protocols in `common`, bind them in `api`:

```typescript
import { bind } from '@owlmeans/server-entrypoint'
import { handlers } from '@owlmeans/server-api'
import { appEntrypoints as protocols } from 'my-app-common'
import type { Context } from 'my-app-backend'

const api = handlers<Context>()
const appEntrypoints = [
  bind(protocols.api.projectCreate, api.request(protocols.api.projectCreate, async (req, ctx) =>
    ctx.project().create(req.body))),
  bind(protocols.api.projectGet, api.params(protocols.api.projectGet, async (req, ctx) =>
    ctx.project().get(req.params.id))),
]
```

## API

### `bind<Protocol>(protocol, handler?, opts?): ServerProtocolEntrypoint<Protocol>`

Materializes one immutable protocol declaration and attaches its protocol-bound implementation.

### `bindAll(protocols, handlers?): ServerProtocolEntrypoint[]`

Materializes a flat declaration collection and pairs implementations by protocol reference.

### `ServerEntrypoint<R>`

Extends `CommonEntrypoint` with:
- `route: ServerRouteModel<R>` — the server route declaration; `route.match(request, entrypoint.mount())`
  answers whether a request hits it
- `handle: RefedEntrypointHandler<R>` — the attached handler

### `RefedEntrypointHandler<R>`

A handler factory: `(ref: { ref?: { ctx?: Context } }) => EntrypointHandler`.

## Related Packages

- [`@owlmeans/entrypoint`](../entrypoint) — immutable protocol declarations
- [`@owlmeans/server-api`](../server-api) — typed handler factories used with `bind`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.19
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
