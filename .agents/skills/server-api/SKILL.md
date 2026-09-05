---
name: server-api
description: How to use @owlmeans/server-api — the Fastify-based API server factory, what it mounts and validates, the request pipeline (intermediates, guards, gates, handlers), holdApiPort() for the boot window, and the error-to-status mapping. Auto-invoked when importing server-api types, extending the server middleware stack, or working out why a request answered the status it did.
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
| `extractUploadedFile(req)` | The multipart file behind a request, as `UploadedFile` |
| `holdApiPort(cfg, opts?)` | Own the app's port during boot; the caller awaits `hold.release()` before `listen()` |
| `ApiServer`, `ApiServerAppend`, `Request`, `Response`, `Config`, `Context` | Runtime and context shapes |
| `ApiPortHold`, `ApiPortHoldOptions` | The hold handle and its `{ okPath?, payload? }` options |
| `AuthFailedError` | Raised by the request pipeline when no guard matched or the matching guard refused — the only one of this package's own two errors the pipeline raises |
| `AccessError` | Its 403 counterpart, for a guard, gate or handler to throw when an established identity lacks the permission; the pipeline never raises it |
| `NoFileError` | For a handler to throw when `extractUploadedFile` finds no file; the pipeline never raises it |
| Constants | `DEFAULT_ALIAS` (`api-server`), `PORT` (`80`), `CLOSED_HOST` (`127.0.0.1`), `OPENED_HOST` (`0.0.0.0`) |

## Subpath Exports

- `./utils` — `handleError`, `authorize`, `provideRequest`, `executeResponse`, `populateContext`, `extractContext`, `canServeModule`, `createServerHandler`, `fixFormatDates`

## Usage

The server is normally constructed transparently by `@owlmeans/server-app#main()`. Use `server-api`
directly only when you need to register raw Fastify plugins or customize transport:

```typescript
import { appendApiServer } from '@owlmeans/server-api'
appendApiServer(context)
```

## Writing handlers

`handleRequest(fn)` gives the whole request, `handleBody<T>(fn)` the validated body, `handleParams<T>(fn)`
the validated URL params, and `handleIntermediate(fn)` a function that returns a context (or `null`
to leave the chain unchanged) instead of a value. All four resolve the handler's context the same
way: from the request when it arrived over HTTP, and from the entrypoint's own context otherwise —
the same handler runs unchanged when a queued job or a socket frame reaches it, and only the way it
was reached differs.

Throwing is the way to fail. A handler owns no status table; see the mapping below.

## What this server mounts

`canServeModule` mounts a backend entrypoint only when the route's type is `Backend`, the route
belongs to this service, its protocol is one HTTP carries, and the declaration has been elevated —
the last test is `isIntermediate` on the route model, which only a server route model has. `SOCKET`
and `QUEUE` are excluded: a socket is upgraded elsewhere and a queued job is taken off the broker by
the worker, so mounting either here would answer the same call twice. Adding a protocol means
excluding it here as well as binding its transport.

## Where a route is bound

Every route is registered at `entrypoint.mount()` — `base` plus every ancestor's segment, then this
one. A declaration states only the segment it contributes, so the full address takes the context the
entrypoint is registered in, and the table can therefore only be built once the context has resolved.
Intermediates are not bound as routes: they run in a `preHandler` hook, each testing
`entrypoint.route.match(request, entrypoint.mount())` against the same mounted path and passing the
context it produced down the chain. Once one of them has answered, the rest are skipped.

A route is bound only when its entrypoint carries a `handle`. Guards and gates come from
`getGuards()` / `getGates()`, which include everything the ancestors declared, and they run before
the handler — a handler that re-checks them is duplicating an enforced rule.

## Guards, and the organization entity they resolve

`authorize` (`./utils`) runs the guard chain: each alias from `getGuards()` is asked to `match()`,
the first that does is asked to `handle()`, and a chain where none matches or the matching one
refuses raises `AuthFailedError`. The admitted `Auth` is hung on the raw request as `_auth`, which
`provideRequest` surfaces to the handler as `req.auth`.

Immediately after that, and only when the entrypoint has guards, `authorize` calls `attachEntity`
from `@owlmeans/auth-common`: the token names the organization by `entitySlug`, which is renameable,
so the entity is resolved once here rather than in every handler. The resolution is hung on the raw
request as `_entity` and reaches the handler as `req.entity` (`{ id, slug, iamKey }`), and
`attachEntity` also rewrites `req.auth.entitySlug` to the entity's current slug, so a request that
arrived under a retired name continues under the live one. It is a no-op where no entity resolver
service is registered, and it raises `AuthenFailed` when the token names an organization that does
not resolve.

Two consequences a handler has to work by: there is **no id on the token** — `req.auth` carries the
slug and nothing else about the organization, so `req.entity?.id` (or `entityKeyOf(req)` /
`requireEntityKey(req)` from `@owlmeans/auth-common`) is the value to key records by; and an
unguarded entrypoint gets neither `req.auth` nor `req.entity`, because the whole block is skipped
when `getGuards()` is empty.

## Request validation

The route schema is built from the entrypoint's `filter`: `querystring`, `params` and `headers`
always, `body` only for `POST`, `PATCH` and `PUT`, and `response` as declared. Bodies are consumed
as JSON, form-urlencoded or multipart.

Ajv is configured with `coerceTypes`, `useDefaults` and `removeAdditional` — so a query string
arrives typed, declared defaults are filled in, and **an undeclared property is dropped rather than
rejected**: a field missing in a handler is usually a field missing from the filter. `fixFormatDates`
rewrites `date-time` properties declared as objects into strings before compiling, so a schema
generated from a record type validates the JSON that actually arrives.

## The plugins the server registers

Registered on init, in this order — CORS, multipart, Helmet, raw body, middie — and worth knowing
because they set limits an app cannot see from its handler:

- **CORS** — `origin: '*'`, the full framework method set declared explicitly plus `HEAD` and
  `OPTIONS`, and the `auth-token-refresh` header exposed so a browser client can read a rotated
  token. The method list must stay explicit: a narrower default makes the browser reject every
  `PUT`/`PATCH`/`DELETE` at preflight while server-to-server callers keep working.
- **Multipart** — fields attached to the body as key/values, at most 5 files of 5 MB each, over-size
  uploads throwing rather than truncating.
- **Helmet**.
- **Raw body** on the `rawBody` request field, captured before anything else (`runFirst`) — that is
  what a webhook signature check reads, since the parsed body cannot be re-serialized byte for byte.
- **middie**, last, for connect-style middleware.

The overall body limit is 20 MB.

## Listening

`listen()` resolves the socket from the service's own declaration, `cfg.services[cfg.service]`:
`internalPort ?? port ?? PORT`, and `OPENED_HOST` when `opened` is true, `CLOSED_HOST` otherwise. It
also installs a `SIGTERM` handler that closes the server and exits 0. Initialization is re-entrant:
an already-listening instance is closed and rebuilt, so re-initializing a context does not leave two
servers on one port.

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

`release()` awaits the actual close and force-closes keep-alive connections, so a supervisor's own
poller cannot hold the handover open.

Two rules the caller owns: a **bind failure is fatal and loud** — name it (EADDRINUSE above all)
and `process.exit(1)`, because carrying on ends the boot with nothing listening and nothing
holding the event loop, a clean exit 0 while a stale predecessor keeps serving; and a **failed
init returns without exiting** — the hold keeps the loop open and is the only thing that can say
why.

## Error → HTTP status

`handleError` (`./utils`) is the single mapping from a thrown error to a status. Handlers own no
status table: they throw, and this decides. Two families are recognised — this package's own
`AuthFailedError` and `AccessError`, of which only `AuthFailedError` is raised by the pipeline, and
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

`AuthenFailed` — the error `attachEntity` raises inside this same pipeline when the token names an
organization that does not resolve — belongs to neither family: it extends `AuthManagerError`, not
`AuthorizationError`. It therefore falls through to **500**, not 401. Treat a 500 on a guarded
entrypoint as a candidate unresolvable organization entity, and give a gate or handler that wants a
401 there one of the two recognised families to throw.

The body is always `ResilientError.marshal(ResilientError.ensure(error)).message`, and nothing is
written when the reply was already sent. An entrypoint that names a `fixer` gets that service
instead — it renders the error onto the reply itself and `handleError` never runs.

## Depends On

- `@owlmeans/context`, `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/server-context`, `@owlmeans/server-entrypoint`
- `@owlmeans/auth` (the error family the guards throw), `@owlmeans/auth-common`, `@owlmeans/error`, `@owlmeans/api` (status constants)
- `fastify` (runtime) with `@fastify/cors`, `@fastify/helmet`, `@fastify/middie`, `@fastify/multipart`, `fastify-raw-body`, `ajv-errors`

`ajv` and `ajv-formats` are **peer** dependencies, not runtime ones — the validator compiler is
built from them, so installing this package without also depending on both leaves unmet peers and a
server that cannot compile a route schema. Declare them alongside `@owlmeans/server-api`.
