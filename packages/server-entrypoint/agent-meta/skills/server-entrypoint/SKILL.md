---
name: server-entrypoint
description: How to use @owlmeans/server-entrypoint — server-side entrypoints extending @owlmeans/entrypoint with handler attachment, elevate() forms, intermediates, guards and mount(). Auto-invoked when importing server-entrypoint types or writing a custom entrypoint helper.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-entrypoint

**Layer:** Server
**Install:** `"@owlmeans/server-entrypoint": "^0.1.18-rc.11"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ServerEntrypoint<R>` | Server entrypoint interface — a common entrypoint whose `route` is a `ServerRouteModel` plus `handle` and an optional `fixer` |
| `entrypoint(arg, handler?, opts?)` | Build one from an existing declaration, a server route model, or a plain route model |
| `elevate(entrypoints, alias, handler?, opts?)` | Replace the declaration under `alias` in-place with its elevated counterpart |
| `guard(alias, opts?)` | Options that require a guard, ready to pass as `opts` |
| `EntrypointOptions<R>` | `fixer`, `intermediate`, `routeOptions`, plus everything a common entrypoint declares. `elevate()` reads only `route`-shaping and access keys from it — `intermediate`, `routeOptions`, `filter`, `guards`, `gate`, `gateParams`, `fixer`; `handle` and `sticky` are silently ignored there |
| `EntrypointRef<R>` / `RefedEntrypointHandler<R>` | `(ref) => handler` — the wrapper is handed a ref that resolves to the entrypoint being built, which is how a handler reaches its own `ctx` |
| `FixerService` | Per-entrypoint error rendering (`handle(reply, error)`), named by `opts.fixer` and resolved as a service |

## Usage

Most app code uses `elevate()` from `@owlmeans/server-app` (which re-exports this one). Import
directly only when implementing custom entrypoint helpers.

```typescript
import { elevate, guard } from '@owlmeans/server-entrypoint'
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
```

### elevate forms

The third argument is overloaded, and all four forms are legal:

```typescript
elevate(entrypoints, alias)                     // bare — make it a server entrypoint, nothing more
elevate(entrypoints, alias, handler)            // attach a handler
elevate(entrypoints, alias, guard(DAUTH_GUARD)) // options only
elevate(entrypoints, alias, handler, true)      // trailing boolean === { intermediate: true }
```

`DAUTH_GUARD` above is `@owlmeans/server-auth`'s `DEFAULT_ALIAS` (`auth`), re-exported under that
name by `@owlmeans/server-app`.

It throws `SyntaxError` when no entrypoint in the list carries that alias, and it mutates the array
it is given — the elevated entrypoint replaces the element, and the same array is returned.

**A handler only ever arrives as the third argument.** `elevate` passes the options through
`entrypoint()`, which on an already-declared entrypoint applies `route`, `filter`, `guards`, `gate`,
`gateParams`, `intermediate` and `fixer` and nothing else — so `elevate(list, ALIAS, { handle: fn })`
type-checks, drops the function, and leaves an entrypoint the server never binds.

Elevating is **idempotent**: elevating the same alias again simply replaces the element once more.
An entrypoint stays intermediate unless the new call says otherwise, guards passed at elevation are
**unioned** with the ones the declaration already carries (so what the entrypoint declared still
applies), and a `fixer` already set survives a call that does not name one.

The **bare** form only converts the declaration into a server entrypoint — a `ServerRouteModel`
that `canServeModule` recognises. It creates no route group: an entrypoint with no `handle` is never
bound as a route, guarded or not, and `intermediate` defaults to what the declaration already was
(`false` for a common declaration), so a bare elevate does not put it in the intermediate chain
either. A live intermediate is `elevate(list, ALIAS, handleIntermediate(fn), true)` — a handler plus
`true`, with `handleIntermediate` from `@owlmeans/server-api`.

A parent alias that carries only a `guard()` for its children needs no elevation at all:
`getGuards()` walks `parent()`, which resolves the alias against the context, and a registered
declaration answers there whether or not it was elevated. `gate()` is not in this package — it comes
from `@owlmeans/entrypoint`, and only `guard()` is defined here.

## What a server registers

`mount()` is the address a server binds: `base` plus every ancestor's segment, then this one. The
declaration itself only ever states the segment it contributes, so composing the rest takes the
context the entrypoint is registered in — which is why route registration happens after `init()`,
never at declaration time.

```typescript
server.route({ url: entrypoint.mount(), method, handler })
entrypoint.route.match(request, entrypoint.mount())   // intermediates test the same mount
```

Guards and gates are read with `getGuards()` / `getGates()`, which include everything the ancestors
declared, and they run before the handler — a handler that re-checks them duplicates an enforced
rule.

## Cross-Service URL Generation

Use `makeSecurityHelper` from `@owlmeans/config` to build URLs pointing at other services (OAuth
redirect URIs, webhook callbacks, etc.):

```typescript
import { makeSecurityHelper } from '@owlmeans/config'
const helper = makeSecurityHelper<Config, Context>(ctx)
const url = helper.makeUrl(entrypoint.address(), '/callback')
```

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/server-route`, `@owlmeans/route`, `@owlmeans/context`
