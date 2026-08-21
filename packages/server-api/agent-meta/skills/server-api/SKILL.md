---
name: server-api
description: How to use @owlmeans/server-api — Fastify-based API server factory, request/response shapes, server middleware integration. Auto-invoked when importing server-api types or extending the server middleware stack.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-api

**Layer:** Server
**Install:** `"@owlmeans/server-api": "^0.1.18-rc.10"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeServer()` | Factory for the Fastify-based API server |
| `holdApiPort(cfg, { okPath?, payload? })` | Own the app's port during boot; released by the real `listen()` |
| `Server`, `ServerRequest`, `ServerResponse` types | Runtime shapes |
| Errors | Typed transport errors |
| Constants | Default ports, paths |
| Helpers | Middleware composition |

## Subpath Exports

- `./utils` — server utility functions

## Usage

The server is normally constructed transparently by `@owlmeans/server-app#main()`. Use `server-api` directly only when you need to register raw Fastify plugins or customize transport:

```typescript
import { makeServer } from '@owlmeans/server-api'
const server = makeServer({ port: 8080 })
context.registerService(server)
```

## Holding the port through the boot

The server builds its route table from the entrypoints the context knows about, so it can only
bind **after** `init()` resolves — and Fastify refuses new routes once it is listening. That
leaves every way a boot can fail with nothing on the port: the edge answers a bare upstream
connect error naming neither the app nor the reason.

`holdApiPort` closes that window: a minimal Fastify instance binds the app's socket immediately —
resolving port and host from the same `cfg.services[cfg.service]` declaration `listen()` uses —
answers `okPath` with 200 and everything else with **503, not 404** (the real routes do not exist
yet, and "no such route" would be a lie that outlives the boot), evaluating `payload()` per
request so a changing boot phase is reported live.

```typescript
const hold = await holdApiPort(ctx.cfg, { okPath: '/healtz', payload: bootPayload })
try { await initialize() } catch (e) { recordFailure(e); return }   // hold keeps answering
await hold.release()          // awaited — listen() binds on the next line
await ctx.getApiServer().listen()
```

Two rules the caller owns: a **bind failure is fatal and loud** — name it (EADDRINUSE above all)
and `process.exit(1)`, because carrying on ends the boot with nothing listening and nothing
holding the event loop, a clean exit 0 while a stale predecessor keeps serving; and a **failed
init returns without exiting** — the hold keeps the loop open and is the only thing that can say
why.

## Error → HTTP status

`handleError` (`./utils`) is the single mapping from a thrown error to a status. Handlers own no
status table: they throw, and this decides. Two families reach it and both are recognised —
`AccessError` / `AuthFailedError`, raised by this package's own request pipeline, and
`AuthForbidden` / `AuthorizationError` from `@owlmeans/auth`, which is what guards and gates throw.

| Thrown | Status | Meaning |
|--------|--------|---------|
| `AuthForbidden`, `AccessError` | `403` | An established identity that lacks the permission — re-authenticating changes nothing |
| `AuthorizationError`, `AuthFailedError` | `401` | No usable credential: absent, expired, revoked, or naming a session this server does not hold |
| anything else | `500` | |

**Order matters.** `AuthForbidden extends AuthorizationError`, so the 403 branch is tested first —
otherwise every refusal of a permission is reported as a failure to authenticate. And an
unrecognised refusal answering 500 reports a refused request as a crashed server: the client cannot
tell "sign in again" from "the service is broken", and a consumer watching statuses concludes the
application fell over.

The body is always `ResilientError.marshal(ResilientError.ensure(error)).message`, and nothing is
written when the reply was already sent.

## Depends On

- `@owlmeans/context`, `@owlmeans/entrypoint`, `@owlmeans/route`
- `@owlmeans/auth` (the error family the guards throw), `@owlmeans/error`, `@owlmeans/api` (status constants)
- `fastify` (runtime)
