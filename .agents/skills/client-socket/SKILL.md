---
name: client-socket
description: How to use @owlmeans/client-socket — opening a self-restoring WebSocket Connection to a socket entrypoint from browsers and native clients, the reconnect policy and its options, the socket-status aggregator, the useWs hook and the system frames a carrier emits. Auto-invoked when importing client socket primitives or wiring a browser subscription.
user-invocable: false
---

# @owlmeans/client-socket

**Layer:** Client
**Install:** `"@owlmeans/client-socket": "^0.1.18-rc.40"` in `dependencies`

The browser carrier for `@owlmeans/socket`. It supplies the four members the connection model
leaves abstract — `send`, `close`, `prepare`, `authenticate` — and hands back a plain `Connection`,
so everything a screen does with the socket is the vocabulary of that package — `observe`,
`notify`, `call`, `listen`. It also restores a dropped WebSocket on its own, on the SAME
`Connection` model, so nothing a caller registered with `observe`/`listen` needs to be
re-registered after a network blip.

## Key Exports

| Export | Description |
|--------|-------------|
| `ws(entrypoint, request?, options?)` | Open a `Connection` to a socket entrypoint. Resolves once the FIRST attempt opens; rejects with `SocketConnectionError('lost')` if the retry budget elapses first |
| `useWs(protocol \| alias, request?, options?)` | React hook — `Connection \| null` until it opens (or gives up); re-opens on `alias`/`AUTH_QUERY`/`params` change and closes on unmount |
| `connect(address, ctx, options?)` | The same machinery with no entrypoint behind it — an `address` callback returning the URL, for an adapter or a test |
| `appendSocketStatus(ctx, alias?)` / `useSocketStatus()` / `useSocketRetry()` | The status aggregator and its retry — see below |
| `Config` / `Context` | The client config (`socket?: SocketClientSettings`) and context types this package expects |
| `ReconnectPolicy` / `SocketClientSettings` / `ConnectOptions` / `WsOptions` | The reconnect policy shape and where it can be set — config, or per-call `options` |

## How the address is built

A socket entrypoint is **addressed, not called**: `entrypointUrl` from
`@owlmeans/client-entrypoint/utils` turns the declaration plus the asking context into the `wss://`
URL — `:params` filled in, query appended, protocol and TLS taken from the entrypoint's address —
and the connection is opened on that. Nothing is hand-concatenated, so the same declaration the
server binds is the one the client dials. It is re-resolved on EVERY attempt, first one included,
so a `beforeConnect` hook that mutates the request's query (a refreshed token, most often) reaches
every reconnect too, not just the first handshake.

Authentication rides on the query, because a WebSocket handshake carries no Authorization header a
browser can set: the token goes under `AUTH_QUERY`, and the server derives the connection's subject
from it.

**Take the authenticated hook, not this one.** `@owlmeans/client-auth` exports its own `useWs` that
wraps this one, fills `AUTH_QUERY` from `ctx.auth().token`, and refreshes it via `beforeConnect` on
every reconnect — unless the request already carried its own token, in which case that caller's
value is left alone across reconnects too. Import `useWs` from there for anything a guard
protects, and from here only for an entrypoint that is open to everyone.

The in-band auth sequence is a different thing from the query token, and only half of it is here.
`connection.auth(stage, payload)` sends the frame and resolves on the server's reply — that is the
client-initiated exchange, and it works. This carrier's own `authenticate` is a stub answering an
empty tuple, so an `Auth` frame the SERVER opens finds no stage to answer with and is dropped
without a reply: a browser can start an exchange, never answer one.

**A reconnect is a brand-new server-side connection.** If a server sets up subscriptions only
after an in-band `authenticate` frame (as this platform's own handlers do — see the `socket`
memory in `viable`), the carrier does NOT replay that frame by itself; it only reopens the pipe.
A caller that authenticates in-band must listen for `SocketSystemEvent.Reconnected` and resend it
— `viable`'s `sources/manager-web/src/lib/ws.ts` `useAuthWs` is the worked example.

## Usage

```typescript
// A guarded entrypoint: this useWs fills AUTH_QUERY from the current session and keeps it fresh
// across reconnects.
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

Pass the immutable socket protocol declaration in application code. A string alias is reserved
for an adapter whose remote declaration is unavailable to import. Both hooks re-open when the
protocol, `AUTH_QUERY` value, or params change — the params are compared by content, so a fresh
object literal each render does not re-open. Both close the connection when the component unmounts,
and both answer `null` until the socket is open, so every effect that touches one guards on that.

## Disconnects and reconnects

The carrier keeps the same `Connection` MODEL for the life of the hook/call and swaps only the
underlying `WebSocket` underneath it — every `observe`/`listen` a caller registered survives a
reconnect, because it was registered on the model, not on the socket.

**The retry policy** (`ReconnectPolicy`, defaults in `DEFAULT_RECONNECT_POLICY`):

| Field | Default | Meaning |
|---|---|---|
| `minDelay` | 200ms | First retry delay |
| `maxDelay` | 3000ms | Delay ceiling — backoff never grows past this |
| `factor` | 2 | Geometric growth per failed attempt |
| `jitter` | 0.1 | ±10% randomization on each computed delay |
| `budget` | 600000ms (10 min) | Total retry time before the carrier gives up |
| `reviveBudget` | 15000ms | Retry window `retry()` gives a lost socket (and the minimum it leaves one still retrying) — short, so a retry that cannot succeed reports `'lost'` again while someone is still looking |
| `stableAfter` | 10000ms | How long a reopened socket must stay up before the attempt count, the outage clock and the budget (back to `budget`) reset |
| `heartbeat` | 30000ms | Ping interval — runs even with `reconnect: false` |
| `pongTimeout` | 10000ms | Checked at the next heartbeat tick: the ping still unanswered this long ⇒ the carrier force-closes the socket itself (code 4000, `SOCKET_HEARTBEAT_TIMEOUT_CODE`) — the only way a silently half-open TCP connection is noticed before the OS would, minutes later. Measured from the PING, never from the last frame: a hidden tab's timers are throttled to roughly one wake-up a minute, and "nothing for a whole interval" is what throttling looks like, not what a dead socket looks like. Any inbound frame answers the ping; `server-socket` replies `{"type":"pong"}` |

Set it on `ctx.cfg.socket.reconnect` (app-wide) or per call via `options.reconnect` (which wins).
`reconnect: false` disables retries — a drop is reported once and stays dropped, the
pre-reconnect-support behaviour — while the heartbeat/liveness check above still runs. Use it for
a stateful one-shot handshake a reconnect could never resume correctly (the wallet-tunnel rely
session in `client-auth` sets it for exactly this reason).

**System frames** (`SocketSystemEvent`, from `@owlmeans/socket`) reach every `connection.listen`
subscriber:

| Event | When |
|---|---|
| `disconnected` | The socket dropped and a retry IS scheduled — `{ code }` |
| `reconnecting` | Before each retry attempt — `{ attempt, delay }` (`delay: 0` for a revive's immediate attempt) |
| `reconnected` | A retry succeeded, a revived one included — `{ attempts }` |
| `lost` | The retry budget elapsed with no success — no payload. The connection is NOT closed: it stays revivable (below) until its owner closes it |
| `close` | The connection is gone for GOOD: a client-initiated close, a terminal server code (1000/1008), or `reconnect: false` and the one attempt failed. Never follows `lost` by itself |

```typescript
connection.listen(async message => {
  const msg = message as EventMessage<unknown>
  if (typeof message !== 'object' || msg.type !== 'system') return
  if (msg.event === SocketSystemEvent.Reconnected) await resubscribe()
  if (msg.event === SocketSystemEvent.Close) await release()
})
```

**The status aggregator.** `appendSocketStatus(ctx)` registers a shared service every
`ws()`/`useWs()` connection reports its state into; `useSocketStatus()` reads the WORST state
across all of them (`'online' | 'reconnecting' | 'lost'`). A `'lost'` connection stays in the
aggregate — that is what `@owlmeans/web-panel`'s `SocketReloadDialog` reads to put up its global
prompt (`cfg.socket.reloadDialog`) — until something revives or closes it. Calling
`appendSocketStatus` unconditionally is cheap and safe for a host package — nothing reports into
it unless something calls `ws()`/`useWs()`, so an app that never does behaves exactly as before.

**Retry.** `socketStatus().retry()` revives every `'lost'` connection and hurries every
`'reconnecting'` one (attempt at once instead of after the backoff, and at least `reviveBudget`
left) — without that, a sibling whose older budget runs out a moment later reports `'lost'` right
after the retry and puts the dialog straight back. It fires `onRetry` listeners and returns `true`
only when something was lost, so calling it freely is safe.
The service calls it by itself when the tab becomes visible, the window gains focus, or the
browser goes back `online` — a background tab is where sockets die unnoticed (throttled timers, a
sleeping machine), so the moment it is looked at again is when to retry. How a lost connection
comes back depends on whether it ever opened:

- **Opened before** — revived in place: one attempt at once, then the normal backoff within
  `reviveBudget`. Same `Connection` model, and success emits `reconnected`, so the re-auth / re-sync
  listeners every caller already has for a network blip cover this too. Failing again reports
  `lost` again.
- **Never opened** — `ws()` already rejected and nobody holds it, so it is closed for good and
  released. `useWs` re-dials by itself on `onRetry` (a fresh `ws()`, full `budget`); a direct
  `ws()` caller re-opens on its own terms.
- A terminal close (1000/1008, `reconnect: false`) is never revived.

`useSocketRetry()` gives a UI `{ retry, retrying }` — `retrying` is true from any retry (the
button, or the service's own on activation) until the aggregate settles on `'online'` or `'lost'`.

`useSocketStatus()` tolerates being called before the context's own `configure()`/`init()` has
run (it defaults to `'online'` and re-attaches once `ctx.waitForInitialized()` resolves) — a
component mounted as a sibling of the router, as `SocketReloadDialog` is, renders on React's
first commit, before the router's effect has had a chance to initialize the context.

Outbound frames are stamped with `dt` and dropped rather than queued while the socket is not
`OPEN`, so a `notify` issued while the socket is down is lost rather than delivered late. Nothing
here replays events the SERVER sent while the socket was down either — a caller that cannot
tolerate a gap re-syncs its own state on `reconnected` (viable's file-watch editor re-lists files;
its thinking/slot socket relies on a separate periodic API push for the same reason).

## Depends On

- `@owlmeans/socket` — `createBasicConnection`, `MessageType`, `SocketSystemEvent`,
  `SOCKET_HEARTBEAT_TIMEOUT_CODE`, `SocketConnectionError`, the `Connection` contract
- `@owlmeans/client-entrypoint` — `entrypointUrl`, `provideRequest`
- `@owlmeans/client` — `useContext`, `useValue`; `@owlmeans/client-context` — the config type
- `@owlmeans/auth` — `AUTH_QUERY`, `AuthenticationStage`
- `@owlmeans/basic-ids` — `createIdOfLength`, for the per-connection status-tracking id
- `react` (peer)

## Related

- `socket` — the message model every verb here belongs to, and the `SocketSystemEvent` vocabulary
- `server-socket` — the far side: guard enforcement, and what it stamps on a frame
- `client-auth` — the `useWs` that carries the token and refreshes it across reconnects;
  `client-job` — `useJobFeed`, a worked subscription built on it
- `web-panel` — `SocketReloadDialog`, the global blocking prompt built on `useSocketStatus()` /
  `useSocketRetry()`
