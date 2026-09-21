---
name: server-entrypoint
description: Bind immutable @owlmeans/entrypoint declarations to protocol-bound server implementations. Load when serving a shared API, socket, or queue entrypoint.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-entrypoint

**Install:** `bun add @owlmeans/server-entrypoint@^0.1.18-rc.28`

Bind the imported protocol object to the implementation that serves it:

```ts
import { bind } from '@owlmeans/server-entrypoint'
import { handlers } from '@owlmeans/server-api'

const api = handlers<AppContext>()

export const serverBindings = [
  bind(projectProtocols.create, api.body(projectProtocols.create, async (body, context) =>
    context.projects.create(body)
  )),
]
```

`bind(protocol, handler?, options?)` returns a `ServerProtocolEntrypoint<Protocol>`.
`bindAll(declarations, handlers?)` is for a flat protocol collection at a registration boundary. A handler carries its
`protocol`, and a collection is matched by object identity; an alias is never used to find or
replace it. HTTP code should use `handlers<Context>()`; sockets use `connection(protocol, callback)`.

The second argument is either a protocol-bound handler (from `handlers<Context>()` above, or a
library factory that returns one) or omitted entirely for a parent route. A plain callback passed
directly to `bind()` is NOT the same thing: it is treated as a ref handler and invoked once, at
bind time, with the entrypoint ref as its only argument — not per-request. Wrap it with
`handlers<Context>()` first.

Do not create a mutable contextual declaration, use a compatibility entrypoint type, or attach a
handler with an alias. The declaration is shared data; the binding is its server-local runtime.
