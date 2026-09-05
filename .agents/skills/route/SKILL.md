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
| `job(options?, secondary?)` | A backend route carried by the queue (`RouteProtocols.QUEUE`); its declaration adds `queue`, `reply` and `timeout` |
| `service(alias, options?)` | Point a route at a named service |
| `RouteMethod` | enum of GET, POST, PUT, PATCH, DELETE |
| `RouteProtocols` | enum of WEB (`http`), SOCKET (`ws`), QUEUE (`queue`) |
| `rtype(type, options?)` | The primitive `frontend()` / `backend()` are built from |
| `createRoute(alias, path, opts?)` / `makeRouteModel(decl)` | The declaration and its wrapper, when you need them apart |
| `BasicRoute` | `{ type, service?, host?, port?, base?, internalHost?, internalPort? }` |
| `RouteDeclaration` | The immutable declaration `route()` produces |
| `RouteOptions` | `Partial<RouteDeclaration>` — what the marker helpers return |
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
an HTTP request, a socket frame or a queued job — the call site never says. Both `transportAlias`
and the `EntrypointTransport` contract a transport implements are exported by `@owlmeans/entrypoint`,
not by this package; a route only names the protocol.

`job()` is `backend()` with `RouteProtocols.QUEUE`. Three declaration fields matter only for that
protocol: `queue` (which queue carries it), `reply` and `timeout`. `reply: false` resolves once the
broker has taken the job — the value is the job's identity and the outcome is `Accepted`, not the
job's result; the default is to wait for the result.

## Subpath Exports

`./utils` holds two kinds of helper, and their signatures differ. The six that answer *where* a
route lives take `(context, declaration)`, because that is a question about the asking context. The
other four are pure functions over a declaration or a service entry and take **no context**.
Passing one to them resolves nothing: `overrideParams(ctx, decl)` writes route fields straight into
the context object instead.

| Helper | Signature | Answers |
|--------|-----------|---------|
| `resolvePath` | `(context, route)` | Every ancestor's segment, then this one |
| `resolveMount` | `(context, route)` | `base` + the full path — what a server mounts and a client requests |
| `resolveService` | `(context, route)` | The service the declaration answers on: the one it names, else the default of its app type, else the first of that type |
| `resolveAddress` | `(context, route)` | The `RouteAddress`; a hop over a service's INTERNAL host is never TLS |
| `isLocalRoute` | `(context, route)` | Does the route belong to the service the asking context IS? |
| `getParentRoute` | `(context, route)` | The parent declaration, with parentship-cycle detection |
| `overrideParams` | `(route, overrides?, filter?)` | Fill in **only the blank** fields of `route` from `overrides`; `filter` narrows it to the listed keys. Mutates `route` and returns nothing |
| `prependBase` | `(route, path)` | `path` prefixed with `route.base`, or `path` when there is no base |
| `isServiceRoute` | `(obj?)` | Type guard: is this a service entry (`type` + `service`, `type` a known `AppType`)? |
| `isServiceRouteResolved` | `(route)` | Type guard: does that service entry name a host? |

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

That is the only dependency. The address helpers signal a mis-wired route tree by throwing
`SyntaxError` — an unconfigured service, an unresolved host, a parentship cycle — so the process
crashes on a wiring mistake instead of serving a wrong URL.
