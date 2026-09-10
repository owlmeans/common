# @owlmeans/server-api

Fastify-based HTTP/WebSocket server with handler wrappers for the OwlMeans entrypoint system.

## Overview

- `handleBody`, `handleParams`, `handleRequest` wrap business logic with context injection and error handling
- Built on [Fastify](https://fastify.dev/) — registered entrypoints become Fastify routes automatically
- `createApiServer` / `appendApiServer` initialize the HTTP server in a context
- Not typically used directly — import handlers from `@owlmeans/server-app`

## Installation

```bash
bun add @owlmeans/server-api@^0.1.18-rc.16
```

## Usage

Handler functions attached with `elevate()`:

```typescript
import { handleBody, handleParams, handleRequest } from '@owlmeans/server-app'

// Body handler: receives parsed + validated body as first arg
export const create = handleBody<CreateProject>(async (payload, context, req) => {
  const ctx = context as Context
  return await ctx.project().create({ ...payload, entityId: req.entity!.id })
})

// Params handler: receives validated URL params as first arg
export const get = handleParams<{ id: string }>(async (params, context, req) => {
  return await (context as Context).project().get(params.id)
})

// Request handler: receives the full AbstractRequest
export const health = handleRequest(async (req, context) => {
  return { status: 'ok' }
})
```

## API

### `handleBody<T>(handler): RefedEntrypointHandler`

Wraps a handler that receives the validated request body as the first argument.
```typescript
handler: (payload: T, ctx: Context, req: AbstractRequest) => Promise<any>
```

### `handleParams<T>(handler): RefedEntrypointHandler`

Wraps a handler that receives the validated URL params as the first argument.
```typescript
handler: (payload: T, ctx: Context, req: AbstractRequest) => Promise<any>
```

### `handleRequest(handler): RefedEntrypointHandler`

Wraps a handler that receives the full request object.
```typescript
handler: (req: AbstractRequest, ctx: Context, res?: AbstractResponse) => Promise<any>
```

### `handleIntermediate(handler): RefedEntrypointHandler`

Wraps middleware-layer handlers that do not return a final response.

### `extractUploadedFile(req, fieldName): UploadedFile | null`

Extract a multipart-uploaded file from the request.

## Related Packages

- [`@owlmeans/server-app`](../server-app) — re-exports all handlers; preferred import point
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — `elevate()` attaches handlers to entrypoints
- [`@owlmeans/server-socket`](../server-socket) — WebSocket `handleConnection` counterpart

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
