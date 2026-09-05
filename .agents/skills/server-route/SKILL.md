---
name: server-route
description: How to use @owlmeans/server-route — wrapping a route model for server use, matching a request against a mounted path, intermediate vs leaf routes, and the ServiceRoute config shape. Auto-invoked when importing server-route helpers or writing a custom request matcher.
user-invocable: false
---

# @owlmeans/server-route

**Layer:** Server
**Install:** `"@owlmeans/server-route": "^0.1.18-rc.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `route(model, intermediate, opts?)` | Wrap a route model for server use; with `opts.overrides` it also writes defaults into the declaration it wraps |
| `ServerRouteModel<R>` | `{ route, match(request, mount), isIntermediate() }` |
| `ServerRoute` | A route declaration plus the server extras |
| `ServiceRoute` | A service config entry plus the same extras — what `cfg.services` holds |
| `ServerRouteExtras` | `internalHost`, `internalPort`, `opened` — the fields `ServerRoute` and `ServiceRoute` share |
| `ServerRouteOptions<R>` | `{ overrides, pathField, match }` |
| `isServerRouteModel(obj)` | The `isIntermediate` marker test |
| `WILDCARD` (`*`), `DEFAULT_FIELD` (`url`) | Matching constants |

## Matching

`match(request, mount)` takes the **mounted path from the caller**: a declaration knows only the
segment it contributes, so composing the rest takes the context the entrypoint is attached to. A
server therefore always asks the entrypoint first and passes the answer in:

```typescript
entrypoint.route.match(request, entrypoint.mount())
```

The matcher behind it reads the request path from `DEFAULT_FIELD`, drops anything after `?`, then
walks the template segment by segment: `:params` are collected, `WILDCARD` swallows a segment (and
the rest of the path when it is the last one), and a literal mismatch or a path that runs out before
the template does is no match.

**A request path that outruns the template still matches** — the test is a prefix test, and it
answers the same for an intermediate model and for a leaf. So `match()` alone never tells a group
apart from an exact route; `isIntermediate()` is what does, and it is what the server reads to
decide whether the entrypoint runs in the `preHandler` chain or is bound as a route. In practice
only intermediates are ever asked to `match()`, because a bound leaf is dispatched by the HTTP
router rather than by this test.

Two escape hatches: `pathField` reads the path from a different request field, and `opts.match`
replaces the whole test with your own `(request, mount) => boolean`.

## Options

`overrides` fills in declaration fields that are **unset** — it is a defaults layer, never a rewrite,
so a value the declaration already states survives. It is applied **in place**: the wrapper shallow-
copies the model but not the declaration under it, so the keys `overrides` supplies are written onto
the caller's own `RouteModel.route`, and every other holder of that declaration sees them. Pass a
declaration you own, or none.

Nothing else here touches the declaration: where a route answers and which host it is reachable on
are computed on demand by the entrypoint against its context, not baked into the model.

## The server extras

`internalHost` / `internalPort` are the cluster-side address, but only the port of the pair reaches
the socket. `listen()` and `holdApiPort()` in `@owlmeans/server-api` read the app's own service entry
— `cfg.services[cfg.service]` — for `internalPort ?? port ?? PORT`, and take the bind host from
`opened` alone: `0.0.0.0` when it is `true`, `127.0.0.1` otherwise. `internalHost` is never read at
bind time. It is read in two places only — `sservice` in `@owlmeans/server-config` uses it as the
`host` fallback, and `@owlmeans/route` compares it against the resolved host when composing an
address, dropping TLS for a hop that stays inside the cluster.

`opened` is read only off a `ServiceRoute`. The same field on a per-route `ServerRoute` declaration
is inert; nothing reads it there.

## Usage

This package is typically used through `@owlmeans/server-app` and `@owlmeans/server-entrypoint`.
Import it directly only for custom routing.

```typescript
import { route as broute } from '@owlmeans/server-route'

const model = broute(routeModel, true, { pathField: 'url' })
```

## Depends On

- `@owlmeans/route`, `@owlmeans/context`
