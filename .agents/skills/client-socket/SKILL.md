---
name: client-socket
description: How to use @owlmeans/client-socket — opening a WebSocket Connection to a socket entrypoint from browsers and native clients, the useWs hook, the heartbeat and the system close frame. Auto-invoked when importing client socket primitives or wiring a browser subscription.
user-invocable: false
---

# @owlmeans/client-socket

**Layer:** Client
**Install:** `"@owlmeans/client-socket": "^0.1.18-rc.13"` in `dependencies`

The browser carrier for `@owlmeans/socket`. It supplies the four members the connection model
leaves abstract — `send`, `close`, `prepare`, `authenticate` — and hands back a plain `Connection`,
so everything a screen does with the socket is the vocabulary of that package — `observe`,
`notify`, `call`, `listen`.

## Key Exports

| Export | Description |
|--------|-------------|
| `ws(entrypoint, request?)` | Open a `Connection` to a socket entrypoint. Resolves once the socket is open, and only then |
| `useWs(entrypoint \| alias, request?)` | React hook — `Connection \| null` until it opens; re-opens on change and closes on unmount |
| `Config` / `Context` | The client config and context types this package expects |

## How the address is built

A socket entrypoint is **addressed, not called**: `entrypointUrl` from
`@owlmeans/client-entrypoint/utils` turns the declaration plus the asking context into the `wss://`
URL — `:params` filled in, query appended, protocol and TLS taken from the entrypoint's address —
and the connection is opened on that. Nothing is hand-concatenated, so the same declaration the
server binds is the one the client dials.

Authentication rides on the query, because a WebSocket handshake carries no Authorization header a
browser can set: the token goes under `AUTH_QUERY`, and the server derives the connection's subject
from it.

**Take the authenticated hook, not this one.** `@owlmeans/client-auth` exports its own `useWs` that
wraps this one and fills `AUTH_QUERY` from `ctx.auth().token` when the request does not already
carry it. Import `useWs` from there for anything a guard protects, and from here only for an
entrypoint that is open to everyone.

The in-band auth sequence is a different thing from the query token, and only half of it is here.
`connection.auth(stage, payload)` sends the frame and resolves on the server's reply — that is the
client-initiated exchange, and it works. This carrier's own `authenticate` is a stub answering an
empty tuple, so an `Auth` frame the SERVER opens finds no stage to answer with and is dropped
without a reply: a browser can start an exchange, never answer one.

## Usage

```typescript
// A guarded entrypoint: this useWs fills AUTH_QUERY from the current session.
import { useWs } from '@owlmeans/client-auth'

// An open one: this useWs sends whatever query it is given, and nothing more.
// import { useWs } from '@owlmeans/client-socket'

const connection = useWs(app.api.project.stream, { params: { id } })

useEffect(() => {
  if (connection == null) {
    return
  }
  const stop = connection.observe<Update>('update', async msg => apply(msg.payload))

  return () => stop()
}, [connection])
```

Both hooks take an alias or the entrypoint itself, and re-open when the alias, the `AUTH_QUERY`
value or the params change — the params are compared by content, so a fresh object literal each
render does not re-open. Both close the connection when the component unmounts, and both answer
`null` until the socket is open, so every effect that touches one guards on that.

## Disconnects

The carrier sends a JSON `{ type: 'ping' }` every 30 seconds while the socket is open and clears
the heartbeat when it closes. A closing socket is reported to the connection's own `listen`
listeners as a system frame — `MessageType.System`, `event: 'close'`, payload `{ code }` — and
that is the only notice a handler gets, so a subscription opened on the connection is released
there:

```typescript
connection.listen(async message => {
  const msg = message as EventMessage<{ code: number }>
  if (typeof message === 'object' && msg.type === MessageType.System && msg.event === 'close') {
    await release()
  }
})
```

**Nothing here reconnects.** The carrier has no retry: it reports a close and stops there, and
`useWs` opens a new socket only when the alias, the `AUTH_QUERY` value or the params change. A
connection that drops stays dropped until something above it changes one of those or remounts the
component, so a screen that must survive a drop re-opens the socket itself and re-reads its data
from the server.

Outbound frames are stamped with `dt` and dropped rather than queued while the socket is not
`OPEN`, so a `notify` issued while the socket is down is lost rather than delivered late.

A handshake that never opens has no error path: `ws()` resolves only from the socket's open event,
so a refused upgrade, a rejected token or a dead network leaves its promise pending forever —
`useWs` stays `null` with nothing reported, and an awaited `ws()` call hangs. Treat a `null` that
never turns into a connection as a failed handshake, and give a screen that depends on one a
timeout of its own.

## Depends On

- `@owlmeans/socket` — `createBasicConnection`, `MessageType`, the `Connection` contract
- `@owlmeans/client-entrypoint` — `entrypointUrl`, `provideRequest`
- `@owlmeans/client` — `useContext`, `useValue`; `@owlmeans/client-context` — the config type
- `@owlmeans/auth` — `AUTH_QUERY`
- `react` (peer)

## Related

- `socket` — the message model every verb here belongs to
- `server-socket` — the far side: guard enforcement, and what it stamps on a frame
- `client-auth` — the `useWs` that carries the token; `client-job` — `useJobFeed`, a worked
  subscription built on it
