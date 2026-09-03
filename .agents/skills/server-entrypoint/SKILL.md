---
name: server-entrypoint
description: How to use @owlmeans/server-entrypoint — server-side entrypoints extending @owlmeans/entrypoint with handler attachment, intermediates and mount(). Auto-invoked when importing server-entrypoint types.
user-invocable: false
---

# @owlmeans/server-entrypoint

**Layer:** Server
**Install:** `"@owlmeans/server-entrypoint": "^0.1.18-rc.10"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ServerEntrypoint<R>` | Server entrypoint interface — a `ServerRouteModel` plus a `handle` |
| `entrypoint(arg, handler?, opts?)` | Build a server entrypoint from a route model or an existing declaration |
| `elevate(entrypoints, alias, handler?, opts?)` | Attach a handler (or just guards) to a declared entrypoint |
| `guard(alias, opts?)` | Require a guard, returning server entrypoint options |
| `EntrypointOptions<R>` | Options for elevating: `handler`, `fixer`, `intermediate`, `routeOptions`, guards/gates/filter |
| `EntrypointRef` / `RefedEntrypointHandler` | Handler reference pattern |
| `FixerService` | Per-entrypoint error rendering (`handle(reply, error)`) |

## Usage

Most app code uses `elevate()` from `@owlmeans/server-app` (which builds on this package). Import directly only when implementing custom entrypoint helpers.

```typescript
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
```

Elevating is **idempotent** — elevating the same alias again simply replaces the element once more,
and an intermediate stays intermediate unless the new call says otherwise. Guards passed at
elevation are **unioned** with the ones the declaration already carries, so what the entrypoint
declared still applies.

## What a server registers

`mount()` is the address a server binds: `base` plus every ancestor's segment, then this one. The
declaration itself only ever states the segment it contributes, so composing the rest takes the
context the entrypoint is registered in — which is why route registration happens after `init()`,
never at declaration time.

```typescript
server.route({ url: entrypoint.mount(), method, handler })
entrypoint.route.match(request, entrypoint.mount())   // intermediates test the same mount
```

## Cross-Service URL Generation

Use `makeSecurityHelper` from `@owlmeans/config` to build URLs pointing at other services (OAuth redirect URIs, webhook callbacks, etc.):

```typescript
import { makeSecurityHelper } from '@owlmeans/config'
const helper = makeSecurityHelper<Config, Context>(ctx)
const url = helper.makeUrl(entrypoint.address(), '/callback')
```

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/server-route`, `@owlmeans/server-context`
