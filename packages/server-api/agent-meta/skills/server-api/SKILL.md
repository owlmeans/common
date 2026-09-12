---
name: server-api
description: Implement HTTP entrypoint protocols with @owlmeans/server-api handlers<Context>().body(), params(), request(), and uploadedFile(). Load before writing an API handler.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-api

Make handlers from the protocol declaration so input and output types stay coupled to the shared
contract:

```ts
const api = handlers<AppContext>()

const create = api.body(projectEntrypoints.create, async (body, context, request) =>
  context.projects.create(body, request.auth)
)

const get = api.params(projectEntrypoints.get, async ({ id }, context) =>
  context.projects.get(id)
)

const search = api.request(projectEntrypoints.search, async (request, context) =>
  context.projects.search(request.query)
)

export const entrypoints = [
  bind(projectEntrypoints.create, create),
  bind(projectEntrypoints.get, get),
  bind(projectEntrypoints.search, search),
]
```

`body` and `params` are available only for a protocol declaring that section. `request` works for
any protocol and receives all its typed sections plus request metadata. A successful callback
return resolves the entrypoint with `EntrypointOutcome.Ok`; a thrown error rejects it.

`uploadedFile(request)` is the Fastify multipart boundary. Keep raw Fastify access there rather
than reaching through `request.original` in application code.

Do not use unbound compatibility handler wrappers. For a WebSocket route use
`@owlmeans/server-socket`'s `connection(protocol, callback)`.
