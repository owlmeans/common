# @owlmeans/server-api

Fastify-based HTTP/WebSocket server with typed handler factories for the OwlMeans entrypoint system.

## Overview

- `handlers<Context>()` creates protocol-bound `body()`, `params()`, `request()` and upload handlers
- Built on [Fastify](https://fastify.dev/) — registered entrypoints become Fastify routes automatically
- `createApiServer` / `appendApiServer` initialize the HTTP server in a context
- Not typically used directly — import handlers from `@owlmeans/server-app`

## Installation

```bash
bun add @owlmeans/server-api@^0.1.18-rc.25
```

## Usage

Handlers are derived from the shared protocol and attached with `bind()`:

```typescript
import { handlers } from '@owlmeans/server-api'
import { bind } from '@owlmeans/server-entrypoint'
import { projectProtocols } from 'project-common/protocols'

const api = handlers<Context>()

// Body handler: receives parsed + validated body as first arg
const create = api.body(projectProtocols.create, async (payload, context, req) => {
  const ctx = context as Context
  return await ctx.project().create({ ...payload, entityId: req.entity!.id })
})

// Params handler: receives validated URL params as first arg
const get = api.params(projectProtocols.get, async (params, context, req) => {
  return await (context as Context).project().get(params.id)
})

// Request handler: receives the full AbstractRequest
const health = api.request(projectProtocols.health, async (req, context) => {
  return { status: 'ok' }
})

export const serverBindings = [
  bind(projectProtocols.create, create),
  bind(projectProtocols.get, get),
  bind(projectProtocols.health, health),
]
```

## API

### `handlers<Context>()`

Creates factories whose first argument is the protocol declaration, coupling the callback to its
request and response contract.
```typescript
handlers<Context>().body(protocol, handler)
handlers<Context>().params(protocol, handler)
handlers<Context>().request(protocol, handler)
```

Each callback returns the response value; thrown `ResilientError` subclasses are mapped by the
server. `uploadedFile(request)` remains the multipart boundary.

### `extractUploadedFile(req, fieldName): UploadedFile | null`

Extract a multipart-uploaded file from the request.

## Related Packages

- [`@owlmeans/server-app`](../server-app) — application bootstrap and convenience re-exports
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — `bind()` attaches handlers to protocols
- [`@owlmeans/server-socket`](../server-socket) — WebSocket `connection` counterpart

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
