---
name: server-entrypoint
description: Bind immutable @owlmeans/entrypoint declarations to protocol-bound server implementations. Load when serving a shared API, socket, or queue entrypoint.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-entrypoint

Bind the imported protocol object to the implementation that serves it:

```ts
import { bind } from '@owlmeans/server-entrypoint'
import { handlers } from '@owlmeans/server-api'

const api = handlers<AppContext>()

export const entrypoints = [
  bind(projectEntrypoints.create, api.body(async (body, context) =>
    context.projects.create(body)
  )),
]
```

`bind(protocol, implementation?, options?)` returns a `ServerProtocolEntrypoint<Protocol>`.
`bindAll(declarations, implementations?)` is for a flat protocol collection. An implementation
carries `protocol`, and a collection is matched by object identity; an alias is never used to find
or replace it.

Use `implementation(protocol, callback)` only when a transport-specific package has no more
precise factory. Its callback receives `HandlerRequest<RequestOf<Protocol>>`, the request-scoped
context, and response; it returns `ResponseOf<Protocol>` or throws. HTTP code should use
`handlers<Context>()`; sockets use `socketHandler`.

Do not create a mutable contextual declaration, use a compatibility entrypoint type, or attach a
handler with an alias. The declaration is shared data; the binding is its server-local runtime.
