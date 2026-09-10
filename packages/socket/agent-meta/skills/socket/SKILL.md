---
name: socket
description: How to use @owlmeans/socket — the transport-agnostic Connection model shared by client-socket and server-socket, its message types (call/request/event/auth/system), the type guards, and the socket error classes. Auto-invoked when importing socket types, message constants or the connection model.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/socket

**Layer:** Core
**Install:** `"@owlmeans/socket": "^0.1.18-rc.9"` in `dependencies`

Contracts and one implementation-free connection model. It knows nothing about WebSockets: the
browser side is `@owlmeans/client-socket`, the Fastify side `@owlmeans/server-socket`, and each
supplies the members the model leaves abstract — `send`, `close`, `authenticate` and `prepare` —
that make it concrete. Both halves of an application therefore speak the same frames.

## Key Exports

| Export | Description |
|--------|-------------|
| `createBasicConnection()` | The connection model — everything below the wire. A carrier assigns `send` / `close` / `authenticate` / `prepare` and feeds bytes to `receive` |
| `Connection` | What a handler is handed: the messaging verbs, `stage`, `getListeners` |
| `Message<T>` | The frame — `{ type, payload, id?, sender?, recipient?, dt?, rawData? }` |
| `CallMessage<T>` / `EventMessage<T>` / `AuthMessage<T>` | The three frames that add a field: `method` + `timeout`, `event`, `stage` |
| `MessageType` | `Call` `Result` `Error` `Request` `Response` `Event` `Message` `Auth` `System` |
| `isMessage` / `isEventMessage` / `isCallMessage` / `isAuthMessage` | Type guards — `isMessage(msg, true)` excludes system frames, `isEventMessage(msg, true)` keeps only them |
| `ConnectionListener` / `CallHendler` / `RequestHandler` / `CallResolver` | The callback shapes |
| `SocketError` and subclasses | `SocketInitializationError`, `SocketConnectionError`, `SocketUnauthorized`, `SocketUnsupported`, `SocketTimeout`, `SocketMessageError`, `SocketMessageMalformed` — all registered with `ResilientError` |
| `CALL_TIMEOUT` | 60 000 ms, the fallback when neither the message nor `connection.defaultCallTimeout` says |

## The four ways to say something

Pick by who is expected to answer and how often — they are separate registries, and a handler
bound to one never sees the others.

| Verb | Answered by | Shape |
|---|---|---|
| `notify(event, payload)` | `observe(event, handler)` | Fire-and-forget, fanned out to every observer of that event name |
| `call(method, ...args)` | `perform(method, handler)` | One RPC, resolved with the handler's return value or rejected with its error |
| `request(payload, observer?)` | `acknowledge(handler)`, answered with `reply(id, payload)` | An open question — acknowledgers run in turn until one takes it |
| `enqueue(payload, id?)` | `consume(filter?)` | A mailbox the far side drains on its own schedule; `enqueued()` is its depth |

```typescript
import { MessageType } from '@owlmeans/socket'
import type { Connection, EventMessage } from '@owlmeans/socket'

connection.observe<Progress>('job-event', async message => render(message.payload))
await connection.notify('job-event', { id, progress: 0.5 })

connection.perform<Report, [string]>('report', async id => await build(id))
const report = await connection.call<Report, [string]>('report', id)
```

A `call` carries an id and a timeout, and the model arms the timer on both sides: the caller
rejects with `SocketTimeout` when the answer does not arrive, and the performer stops sending one
once it has elapsed. `timeout: 0` disables it. A performer that throws is answered with a
`MessageType.Error` frame carrying the marshalled error, so the caller's `call` rejects with the
original class rather than with a string.

## Frames a listener sees

`listen(listener)` receives EVERY inbound frame after the model has routed it — the escape hatch
for what the verbs above do not cover. It also receives the frames a carrier synthesises, which is
how a handler learns the connection is gone:

```typescript
connection.listen(async message => {
  if (typeof message !== 'object') {
    return
  }
  const msg = message as EventMessage<void>
  if (msg.type === MessageType.System && msg.event === 'close') {
    await cleanUp()
  }
})
```

Both carriers emit exactly that frame — `MessageType.System`, `event: 'close'`, payload
`{ code }` — when the socket closes. Nothing else reports a disconnect, so any subscription a
handler opened is released there.

## What the model expects of a carrier

- `receive(raw)` takes the raw string. It only parses text that starts with `{` or `[`; anything
  else is dropped without reaching a listener. The carriers' own heartbeat IS JSON
  (`{ type: 'ping' }`), so it is parsed: it matches no `MessageType` and routes nowhere, yet it
  still reaches every `listen` listener — a listener has to recognise the frames it wants.
- A frame with no `type` is read as `MessageType.Message` and a frame with no `payload` is treated
  as its own payload, so a plain JSON body from a foreign client still arrives as a message.
- `prepare(message, isRequest?)` is the carrier's hook for stamping a frame — timestamps,
  `sender` / `recipient`. It runs on every outbound frame and on every inbound one.
- `send`, `close` and `authenticate` throw `SyntaxError` until a carrier assigns them, so one that
  forgets a member fails loudly rather than dropping frames. `prepare` is the exception: it is
  optional on the interface and simply absent until assigned, and the model calls it defensively —
  a carrier that omits it stamps nothing.

## Authentication

`auth(stage, payload)` sends an `AuthMessage` and waits. The far side's `authenticate` answers with
the next stage and its payload, or throws — a rejection travels back as an `AuthMessage` with a
null stage and is rebuilt by the initiator. `connection.stage` holds the current
`AuthenticationStage` throughout. Only the server carrier implements a real sequence; see the
`server-socket` skill.

## Depends On

- `@owlmeans/error` — `ResilientError`, which every socket error registers with
- `@owlmeans/auth` — `AuthenticationStage`, the vocabulary the auth frames carry
- `@owlmeans/basic-ids` — `uuid` for call and request ids

## Related

- `client-socket` — the browser carrier and `useWs`
- `server-socket` — the Fastify carrier, guard enforcement and `handleConnection`
