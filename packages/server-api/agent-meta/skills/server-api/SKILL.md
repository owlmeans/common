---
name: server-api
description: Implement HTTP entrypoint protocols with @owlmeans/server-api handlers<Context>().body(), params(), request(), and uploadedFile(). Load before writing an API handler.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-api

**Install:** `bun add @owlmeans/server-api@^0.1.18-rc.27`

Make handlers from the protocol declaration so input and output types stay coupled to the shared
contract:

```ts
const api = handlers<AppContext>()

const create = api.body(projectProtocols.create, async (body, context, request) =>
  context.projects.create(body, request.auth)
)

const get = api.params(projectProtocols.get, async ({ id }, context) =>
  context.projects.get(id)
)

const search = api.request(projectProtocols.search, async (request, context) =>
  context.projects.search(request.query)
)

export const serverBindings = [
  bind(projectProtocols.create, create),
  bind(projectProtocols.get, get),
  bind(projectProtocols.search, search),
]
```

`body` and `params` are available only for a protocol declaring that section. `request` works for
any protocol and receives all its typed sections plus request metadata. A successful callback
return resolves the entrypoint with `EntrypointOutcome.Ok`; a thrown error rejects it.

## Wrap exactly once

A handler is wrapped by `handlers<Context>()` exactly once — either shape above (create the bound
handler and bind it directly) is correct on its own. Never combine them: a handler module that
already exports a bound handler must be bound directly, not wrapped again where it is bound.

```ts
// WRONG — bound once in the handler module, wrapped a second time here
export const create = api.body(projectProtocols.create, async (body, context) => ...)
bind(projectProtocols.create, api.body(projectProtocols.create, create))
```

`tsc` rejects the double wrap (`TS2345 "Argument of type 'BoundEntrypointHandler<…>' is not
assignable"`). At runtime, `body`/`params`/`request` return an already-bound handler for the SAME
protocol unchanged, with a one-time warning; anything else that is not a plain function fails only
that one route with `HandlerMisconfiguredError`, instead of the opaque
`TypeError: handler is not a function`.

`uploadedFile(request)` is the Fastify multipart boundary. Keep raw Fastify access there rather
than reaching through `request.original` in application code.

Do not use unbound compatibility handler wrappers. For a WebSocket route use
`@owlmeans/server-socket`'s `connection(protocol, callback)`.
