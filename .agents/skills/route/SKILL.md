---
name: route
description: How to use @owlmeans/route — route() for declaring URL segments, frontend()/backend()/socket()/job() markers, RouteMethod and RouteProtocols enums, and the address helpers under ./utils. Auto-invoked when importing route helpers or defining an entrypoint's URL path.
user-invocable: false
---

# @owlmeans/route

**Layer:** Core
**Install:** `"@owlmeans/route": "^0.1.18-rc.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `route(alias, path, options?)` | Build a route model — `path` is the segment contributed under `parent` |
| `frontend(options?, default?)` | Mark a route as a React page (web only) |
| `backend(options?, method?)` | Mark a route as a backend endpoint |
| `socket(options?, secondary?)` | A backend route answering over `RouteProtocols.SOCKET` |
| `job(options?, secondary?)` | A backend route carried by the queue (`RouteProtocols.QUEUE`) — takes `queue`, `reply`, `timeout` |
| `service(alias, options?)` | Point a route at a named service |
| `RouteMethod` | enum of GET, POST, PUT, PATCH, DELETE |
| `RouteProtocols` | enum of WEB (`http`), SOCKET (`ws`), QUEUE (`queue`) |
| `RouteDeclaration` | The immutable declaration `route()` produces |
| `RouteModel` | `{ route }` — the model wrapping a declaration |
| `RouteAddress` | `{ host, port, base, secure, protocol }` — where a route answers |
| `CommonServiceRoute` / `ResolvedServiceRoute` | A service entry, and one that knows its host |
| `normalizePath(path)`, `SEP`, `PARAM` | Path primitives |

## Declaration and model

`route()` returns a `RouteModel` that does nothing but **wrap an immutable `RouteDeclaration`**. The
declaration is plain data an application ships in its contract package: `path` stays the segment this
route contributes under its parent and is never rewritten, and the model carries no state of its own.
Where the route answers is worked out on demand, against the context that asks — which is what lets
the same declaration serve a client and a server at once.

## Protocol picks the transport

A route names the protocol it answers on, and an application binds one by registering a transport
service under `transportAlias(protocol)`. So the protocol is what decides whether a call travels as
an HTTP request, a socket frame or a queued job — the call site never says. `job()` is `backend()`
with `RouteProtocols.QUEUE`, plus the three fields only a queue needs: `queue` (which one carries
it), `reply` (`false` returns as soon as the job is accepted), and `timeout`.

## Subpath Exports

- `./utils` — the computed address helpers, all taking `(context, declaration)`

| Helper | Answers |
|--------|---------|
| `resolvePath` | Every ancestor's segment, then this one |
| `resolveMount` | `base` + the full path — what a server mounts and a client requests |
| `resolveService` | The service the declaration answers on: the one it names, else the default of its app type, else the first of that type |
| `resolveAddress` | The `RouteAddress`; a hop over a service's INTERNAL host is never TLS |
| `isLocalRoute` | Does the route belong to the service the asking context IS? |
| `getParentRoute` | The parent declaration, with parentship-cycle detection |
| `overrideParams` / `prependBase` | Fill blanks in a declaration; prefix a path with its base |
| `isServiceRoute` / `isServiceRouteResolved` | Guards for service entries |

Application code rarely calls these directly — `@owlmeans/entrypoint` exposes them as `path()`,
`mount()`, `service()`, `address()` and `isLocal()` on the entrypoint itself.

## Usage

```typescript
import { route, frontend, RouteMethod } from '@owlmeans/route'
import { entrypoint } from '@owlmeans/entrypoint'

// Server route
entrypoint(
  route(manager.back.project.create, '/create', {
    parent: manager.back.project.base,
    method: RouteMethod.POST,
  })
)

// Web route — frontend() marks it as a React page
entrypoint(
  route(HOME, '/', frontend({ default: true, parent: BASE }))
)
```

## Depends On

- `@owlmeans/context` — `AppType`, and the entrypoint registry the address helpers walk
- `@owlmeans/error` — route errors
- `@owlmeans/i18n` — translatable errors
