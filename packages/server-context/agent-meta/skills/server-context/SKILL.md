---
name: server-context
description: How to use @owlmeans/server-context — makeServerContext() as the base of a server makeContext(), the ServerConfig shape, config() to build one, and the fileConfigReader middleware. Auto-invoked when building a server context or asking what a bare server context already carries.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-context

**Layer:** Server
**Install:** `"@owlmeans/server-context": "^0.1.18-rc.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeServerContext(cfg)` | Server context factory — the base your `makeContext` builds on |
| `config(service, cfg?)` | Build a `ServerConfig` for `service` — app type `Backend`, `trusted` defaulted to an empty list |
| `ServerContext<C>` | Server-side context interface — a basic context plus the config-resource accessors |
| `ServerConfig` | Server config shape — the server and client config bases plus `services: Record<string, ServiceRoute>` |

## Subpath Exports

- `./utils` — `fileConfigReader`, the config-reading middleware

## What a bare server context already carries

`makeServerContext` is not an empty container. Before it returns it registers:

- `fileConfigReader` — a `Config`/`Configuration`-stage middleware that walks the whole config tree
  and replaces every writable string starting with `/` by that file's trimmed contents (through
  `readConfigValue` from `@owlmeans/server-config`, so mount secrets at absolute paths). This is how
  a mounted secret becomes a plain config value.

  **Read converted values after `init()`, never straight after `configure()`.** `configure()` is not
  an async function: it starts the `Config`/`Configuration` middlewares in a detached promise and
  returns the context immediately, so nothing in the tree is converted yet when it returns. The
  ordering guarantee comes from `waitForConfigured()`, and from `init()`, which awaits it first.

  That detachment also decides how a bad path fails. `readConfigValue` is synchronous and unguarded,
  and the middleware runner is a bare `Promise.all` with no catch, so a config string that looks
  like a path but names no file does **not** throw out of `configure()` — the `ENOENT` escapes as an
  unhandled rejection. The stage is never advanced past `Configuration` either, so the promise
  `init()` awaits never resolves and the boot hangs instead of failing. Read an unhandled `ENOENT`
  at boot as a missing mount, and install an `unhandledRejection` handler that exits non-zero if the
  boot has to be loud.
- Three config resources — the default record store, one keyed on `trusted`, and one keyed on
  `plugins` — reachable through `getConfigResource(alias?)`.
- The basic Ed25519 guard over the `trusted` list, which is what authenticates service-to-service
  calls.
- `authMiddleware`, which wraps the `invoke` of every guarded backend entrypoint so outbound calls
  carry an authentication header.

So a downstream factory adds its own services on top rather than assembling these again.

## Usage

A downstream `backend` package wraps `makeServerContext` and exports its own `makeContext`. It calls
the factory below it, applies its own idempotent `append*(context)` mixins and service
registrations, and returns that same context — the process gets one context, built once:

```typescript
// src/context.ts
import { makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export const makeBackendContext = <C extends ServerConfig, T extends ServerContext<C>>(cfg: C): T => {
  const context = makeServerContext<C, T>(cfg)
  // ... register shared services
  return context
}
```

An application server usually starts from `@owlmeans/server-app#makeContext` instead, which builds on
this and adds the API server, API client, sockets, the static resource and auth.

## Depends On

Declared: `@owlmeans/context`, `@owlmeans/config`, `@owlmeans/client-config`,
`@owlmeans/server-config`, `@owlmeans/route`.

Imported but **not** declared in this package's manifest: `@owlmeans/auth-common` (the Ed25519
guard and the outbound-auth middleware registered above) and `@owlmeans/server-route` (the
`ServiceRoute` type `ServerConfig` is built from). A workspace resolves them anyway; a standalone
install has to name them in its own dependencies.
