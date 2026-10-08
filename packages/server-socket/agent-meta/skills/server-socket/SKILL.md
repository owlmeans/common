---
name: server-socket
description: Bind OwlMeans socket protocol declarations to Fastify WebSocket handlers.
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Socket protocol handlers

**Install:** `bun add @owlmeans/server-socket@^0.1.18-rc.55`

Declare a socket route and its contract in the shared protocol package. Bind it on the server with
`connection()` and `bind()`.

```ts
import { bind } from '@owlmeans/server-entrypoint'
import { connection } from '@owlmeans/server-socket'

export const serverBindings = [
  bind(streamProtocols.watch, connection(streamProtocols.watch,
    async (connection, context, request) => {
      await connection.send({ type: 'ready' })
    }
  )),
]
```

The handler receives a typed connection, context, request and response boundary. Guards and gates
are inherited from the protocol tree and enforced before the WebSocket handler runs: a refused
guard or a closed gate answers the upgrade with an HTTP error and the handler is never reached. A
guard that admits the upgrade authenticates the connection, so frames flow without an in-band
`authenticate`; an unguarded route accepts only authentication frames until its handler's
`authenticate` succeeds, and any other frame before that closes the socket with 1008. Do not expose
Fastify request objects through a shared contract.

## What the route does with the handler's answer

| The handler | The socket |
|---|---|
| returns after wiring listeners (what every `connection()` handler does) | stays open; **a connection handler that resolves nothing sends nothing** — no frame, empty or otherwise |
| resolves a value with `EntrypointOutcome.Ok` (`handleConnection`'s `res`) | receives that value once (a string as is, anything else as JSON), then is closed |
| throws | is closed with 1011; the reason is the refusal marshalled WITHOUT its stack (`type|||message`), clipped to the 123-byte close-reason limit |

`connection()` resolves `undefined` after its callback returns and rejects with whatever it threw.
Sending that `undefined` used to put an empty frame on the wire: Bun refuses it ("send requires a
non-empty message"), the throw became a rejection and every real socket closed with 1011 before it
could authenticate. A server stack never travels in a close reason.

The connection's own `listen` listeners receive the system `close` frame when either side closes,
which is where a handler releases what it subscribed to. Closing the API server closes every open
socket with 1001.

## Tests

`bun test ./tests` (category A, offline). `tests/context.ts` boots a real server context the way
`@owlmeans/server-app` does — `appendApiServer`, `appendSocketService`, `createSocketMiddleware()` —
on `port: 0`, reading the bound port back; a test guard and gate stand in for real ones. Its client
is a plain `WebSocket` under `createBasicConnection()`, the shape of viable's agent→publisher link.

| Spec | Covers |
|---|---|
| `socket.spec.ts` | the idle handler staying open (the empty-frame regression); the publisher file watch (authenticate → `authenticated` → `{ event, path }` notifications; a refused authentication; a pre-auth frame → 1008); a throwing handler → 1011 and its stackless, clipped reason; a value with Ok → one frame and close; the thinking relay's unsubscribe on client close; guards and gates refusing before the handler; server shutdown → 1001 |
| `connection.spec.ts` | `connection()` against the real transport response: resolve with `undefined`, reject with the thrown error, a request without a socket, a binding without a context |

A change to the route's resolve/reject handling is verified by reverting it and watching the
regression spec fail.
