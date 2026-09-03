---
name: server-api
description: How to use @owlmeans/server-api — Fastify-based API server factory, request/response shapes, server middleware integration. Auto-invoked when importing server-api types or extending the server middleware stack.
user-invocable: false
---

# @owlmeans/server-api

**Layer:** Server
**Install:** `"@owlmeans/server-api": "^0.1.18-rc.16"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `createApiServer(alias)` | Factory for the Fastify-based API server |
| `appendApiServer(ctx, alias?)` | Register it and expose `ctx.getApiServer()` |
| `handleRequest` / `handleBody` / `handleParams` / `handleIntermediate` | Wrap an async function as an entrypoint handler |
| `extractUploadedFile(req)` | The multipart file behind a request |
| `holdApiPort(cfg, { okPath?, payload? })` | Own the app's port during boot; released by the real `listen()` |
| `ApiServer`, `Request`, `Response` types | Runtime shapes |
| `AuthFailedError`, `AccessError`, `NoFileError` | Typed request-pipeline errors |
| Constants | `DEFAULT_ALIAS` (`api-server`), `PORT`, `CLOSED_HOST`, `OPENED_HOST` |

## Subpath Exports

- `./utils` — `handleError`, `authorize`, `provideRequest`, `executeResponse`, `populateContext`, `extractContext`, `canServeModule`, `createServerHandler`, `fixFormatDates`

## What this server mounts

`canServeModule` mounts a backend entrypoint only when the route belongs to this service AND its
protocol is one HTTP carries. `SOCKET` and `QUEUE` are excluded: a socket is upgraded elsewhere and
a queued job is taken off the broker by the worker, so mounting either here would answer the same
call twice. Adding a protocol means excluding it here as well as binding its transport.

## Usage

The server is normally constructed transparently by `@owlmeans/server-app#main()`. Use `server-api` directly only when you need to register raw Fastify plugins or customize transport:

```typescript
import { appendApiServer } from '@owlmeans/server-api'
appendApiServer(context)
```

## Where a route is bound

Every route is registered at `entrypoint.mount()` — `base` plus every ancestor's segment, then this
one. A declaration states only the segment it contributes, so the full address takes the context the
entrypoint is registered in, and the table can therefore only be built once the context has resolved.
Intermediates are not bound as routes: they run in a `preHandler` hook and each one tests
`entrypoint.route.match(request, entrypoint.mount())` against the same mounted path, passing the
context it produced down the chain.

A route is bound only when its entrypoint carries a `handle`. Guards and gates come from
`getGuards()` / `getGates()`, which include everything the ancestors declared, and they run before
the handler — a handler that re-checks them is duplicating an enforced rule.

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
