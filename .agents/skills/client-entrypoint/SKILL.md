---
name: client-entrypoint
description: Bind shared entrypoint protocols in a client context with typed call(), invoke(), url(), bindAll(), and bindScreen(). Load when wiring client API routes or screens.
user-invocable: false
---

# @owlmeans/client-entrypoint

Bind a declaration from `@owlmeans/entrypoint`; never construct or replace a contextual
entrypoint by alias.

```ts
import { bind, bindAll, bindScreen } from '@owlmeans/client-entrypoint'

context.registerEntrypoints(bindAll(projectEntrypoints))
context.registerEntrypoint(bind(projectEntrypoints.health))
context.registerEntrypoint(bindScreen(projectEntrypoints.home, handler(Home)))

const value = await context.entrypoint(projectEntrypoints.create).call({ body })
const { value, outcome } = await context.entrypoint(projectEntrypoints.create).invoke({ body })
const href = await context.entrypoint(projectEntrypoints.edit).url({ params: { id } })
```

`bindAll(tree)` flattens a nested named declaration tree while preserving the union of its protocol
types. `bind(protocol)` is appropriate where one protocol must use a distinct client option.
`bindScreen` is for a frontend route and renderer; screens are addressed by `url` and reject
`call`/`invoke`.

`context.entrypoint(protocol)` derives `ClientProtocolEntrypoint<Protocol>` from the protocol. Do
not add an explicit result generic. `entrypointRef<Request, Response>(alias)` is reserved for a
dynamic remote declaration that cannot be imported.

Client calls include only contract request sections plus `CallOptions` (`auth`, host/port/base,
timeout, signal). `url` accepts params/query plus the same address options. The route transport is
chosen by the declaration; callers do not branch for HTTP, socket, or queue.
