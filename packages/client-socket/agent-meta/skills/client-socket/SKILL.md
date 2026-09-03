---
name: client-socket
description: How to use @owlmeans/client-socket — opening a WebSocket connection to a socket entrypoint from browsers and native clients, plus the useWs hook. Auto-invoked when importing client socket primitives.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-socket

**Layer:** Client
**Install:** `"@owlmeans/client-socket": "^0.1.18-rc.14"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ws(entrypoint, request?)` | Open a `Connection` to a socket entrypoint |
| `useWs(entrypoint \| alias, request?)` | React hook — connects, keeps the connection, closes it on unmount |
| `Config` / `Context` | The client config and context types this package expects |

## How the address is built

A socket entrypoint is **addressed, not called**: `entrypointUrl` from
`@owlmeans/client-entrypoint/utils` turns the declaration plus the asking context into the `wss://`
URL — `:params` filled in, query appended, protocol and TLS taken from the entrypoint's address —
and the connection is opened on that. Nothing is hand-concatenated, so the same declaration that the
server binds is the one the client dials.

The connection sends a `ping` every 30 seconds and clears the heartbeat on close.

## Usage

```typescript
import { useWs } from '@owlmeans/client-socket'
import { AUTH_QUERY } from '@owlmeans/auth'

const connection = useWs(app.api.project.stream, {
  params: { id },
  query: { [AUTH_QUERY]: token },
})

connection?.listen(async message => { /* ... */ })
```

`useWs` reconnects when the alias, the auth query value or the params change, and closes the
connection when the component unmounts.

## Depends On

- `@owlmeans/socket`, `@owlmeans/client-entrypoint` (`entrypointUrl`, `provideRequest`), `@owlmeans/client-context`
- `@owlmeans/client` — `useContext`, `useValue`
