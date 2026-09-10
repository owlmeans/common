---
name: server-socket
description: How to use @owlmeans/server-socket — the Fastify WebSocket carrier that serves entrypoints whose route protocol is SOCKET, handleConnection, guard and gate enforcement on the upgrade, token-on-query authentication and the system close frame. Auto-invoked when importing server socket primitives or wiring WebSocket support.
user-invocable: false
---

# @owlmeans/server-socket

**Layer:** Server
**Install:** `"@owlmeans/server-socket": "^0.1.18-rc.17"` in `dependencies`

The server carrier for `@owlmeans/socket`, mounted on the same Fastify instance
`@owlmeans/server-api` runs. It supplies the abstract members of the connection model and hands a
handler a plain `Connection`.

## Key Exports

| Export | Description |
|--------|-------------|
| `createSocketService(alias?)` | Factory for the WebSocket server service |
| `appendSocketService(ctx, alias?)` | Register it on the context |
| `createSocketMiddleware(web?, socket?)` | Loading-stage context middleware that attaches the service to the API server. Marks the config so a re-run does not register twice |
| `handleConnection(fn)` | Wrap `(conn, ctx, req, res) => Promise<void>` as an entrypoint handler |
| `SocketService` | Service interface — `update(api: ApiServer)` |
| `Config` / `Context` | The server config and context types this package expects |
| Constants | `DEFAULT_ALIAS` (`socket-server`) |

## How a socket call is carried

An entrypoint declared with `socket(...)` carries `RouteProtocols.SOCKET`, and the protocol is what
decides the carrier. The HTTP server skips those entrypoints; this service claims them, registering
each at `entrypoint.mount()` on the same Fastify instance with `websocket: true`. So a declaration
moves between HTTP and a socket by changing its protocol, and neither the handler nor the caller is
rewritten.

The same enforcement runs first: a `preHandler` hook matches each candidate with
`entrypoint.route.match(req, entrypoint.mount())`, authorizes it against `getGuards()`, and asserts
every pair from `getGates()` — inherited guards and gates included — before the connection is handed
to the handler. A refusal is rendered by the entrypoint's `fixer` when it declares one, so an
unauthorized upgrade fails the HTTP request rather than opening a socket that answers nothing.

The route's `filter` becomes the Fastify schema for the upgrade request — `query`, `params`,
`headers` — so a malformed connection query is refused before the handler exists.

## Usage

Wire the carrier once, where the application composes its context:

```typescript
import { appendSocketService, createSocketMiddleware } from '@owlmeans/server-socket'

appendSocketService(context)
context.registerMiddleware(createSocketMiddleware())
```

Declare the entrypoint with `socket()` — the `@owlmeans/route` builder that stamps
`RouteProtocols.SOCKET` on a backend route — in the package both halves import, so the browser
dials the very declaration the server binds:

```typescript
import { entrypoint } from '@owlmeans/entrypoint'
import { backend, route, socket } from '@owlmeans/route'

export const entrypoints = [
  entrypoint(route(PROJECT, '/project', backend())),
  entrypoint(route(PROJECT_STREAM, '/watch', socket(PROJECT))),
]
```

Then attach the handler with `elevate`, exactly as for an HTTP entrypoint — the protocol is what
sends it to this carrier instead of to the HTTP server. Nothing is served until this step runs:

```typescript
import { elevate } from '@owlmeans/server-entrypoint'
import { handleConnection } from '@owlmeans/server-socket'
import { MessageType } from '@owlmeans/socket'
import type { EventMessage } from '@owlmeans/socket'

elevate(entrypoints, PROJECT_STREAM, handleConnection(async (conn, ctx, req) => {
  const stop = await subscribeSomewhere(async value => await conn.notify('update', value))

  conn.listen(async message => {
    const msg = message as EventMessage<{ code: number }>
    if (typeof message === 'object' && msg.type === MessageType.System && msg.event === 'close') {
      await stop()
    }
  })
}))
```

**A socket handler never resolves its response.** Resolving sends the value down the socket and,
with `EntrypointOutcome.Ok`, closes it immediately; rejecting closes it with code 1011 and the
marshalled error. `handleConnection` returns the response's value only for signature compatibility.
A long-lived subscription therefore returns without resolving, and lives on the listeners it
registered.

## Who the connection belongs to

A WebSocket handshake carries no Authorization header a browser can set, so the token travels as
the `AUTH_QUERY` query parameter. The carrier reads it lazily, on the first frame in either
direction, and unseals it as an envelope: an `Auth` or `AuthCredentials` payload becomes the
connection's subject, anything else leaves it anonymous.

That subject is what stamps frames, as `profileId ?? userId`: an arriving frame is given it as
`recipient` and the service's own name as `sender`, a departing one is given it as `sender`. It is
the same pair every ownership rule in the framework keys on, so one profile of a multi-profile
account never reads another's stream.

`conn.authenticate(stage, payload)` runs the in-band sequence instead:

| Stage and payload | Answer |
|---|---|
| `Authenticate` with an `AuthToken` | Checked against the context's auth service. Its answer is unsealed as an envelope to become the subject, and the reply carries `Authenticated`. A null answer throws `SocketUnauthorized` |
| `Authenticate` with an already-minted `Auth` | Taken as the subject as it stands, and answered with the SAME stage — not `Authenticated` |
| `Authenticated` | Answers the subject already captured, or throws `SocketUnauthorized` when there is none |
| anything else | `SocketUnsupported('auth-service')` — including a payload at `Authenticate` that is neither of the two above |

## Liveness and shutdown

- A protocol-level ping (the WebSocket control frame) is answered with a pong and goes no further.
- A JSON `{ type: 'ping' }` frame is answered with a protocol pong and a `{ type: 'pong' }` frame,
  and is then handed to the connection model like any other frame. Its `type` matches no
  `MessageType`, so it is routed nowhere, but it still reaches every `conn.listen` listener as an
  object whose `type` is `'ping'` — a listener has to recognise the frames it wants rather than
  assume every one it is given is a message.
- A closing socket reaches the handler as a system frame — `MessageType.System`, `event: 'close'`,
  payload `{ code }` — delivered to every `conn.listen` listener. It is the only disconnect notice,
  so every subscription a handler opened is released there.
- Fastify's `preClose` closes every live connection with code 1001 before the server stops, so a
  rollout does not leave sockets hanging on a process that is going away.

## Depends On

- `@owlmeans/socket` — `createBasicConnection`, `MessageType`, the error classes
- `@owlmeans/entrypoint`, `@owlmeans/server-entrypoint` — `getGuards` / `getGates`, `mount()`
- `@owlmeans/server-api` — the Fastify instance and its request pipeline (`/utils`)
- `@owlmeans/server-auth` — the auth service the in-band sequence calls
- `@owlmeans/auth` — `AUTH_QUERY`, `AuthenticationStage`, and the `isAuth` / `isAuthToken` guards
- `@owlmeans/basic-envelope` — reading the token off the connection query
- `@owlmeans/context`, `@owlmeans/server-context` — service registration and the config type
- `@fastify/websocket` (runtime), `fastify` (peer)

## Related

- `socket` — the message model, and the verbs a handler answers with
- `route` — `socket()`, and what a route's protocol decides
- `client-socket` — the browser carrier that dials these entrypoints
- `server-job` — `watchJobs`, a worked handler built on `handleConnection`
