---
name: server-socket
description: Bind OwlMeans socket protocol declarations to Fastify WebSocket handlers.
---

# Socket protocol handlers

**Install:** `bun add @owlmeans/server-socket@^0.1.18-rc.25`

Declare a socket route and its contract in the shared protocol package. Bind it on the server with
`connection()` and `bind()`.

```ts
import { bind } from '@owlmeans/server-entrypoint'
import { connection } from '@owlmeans/server-socket'

export const appEntrypoints = [
  bind(streamEntrypoints.watch, connection(streamEntrypoints.watch,
    async (connection, context, request) => {
      await connection.send({ type: 'ready' })
    }
  )),
]
```

The handler receives a typed connection, context, request and response boundary. Guards and gates
are inherited from the protocol tree and enforced before the WebSocket handler runs. Do not expose
Fastify request objects through a shared contract.
