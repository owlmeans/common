---
name: api-config-client
description: How to use @owlmeans/api-config-client — the browser half of the runtime config flow, a loading-stage middleware that fetches the config a backend advertises and merges it into the client config. Auto-invoked when wiring runtime API config into a client app or debugging a client that boots with an incomplete config.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/api-config-client

**Layer:** Client
**Install:** `"@owlmeans/api-config-client": "^0.1.18-rc.13"` in `dependencies`

Consumes the declaration shared by `@owlmeans/api-config` and answered by
`@owlmeans/api-config-server`.

## Key Exports

| Export | Description |
|--------|-------------|
| `apiConfigMiddleware` | Context middleware, `Loading` stage — fetches the advertised config and merges it into `context.cfg` |
| `entrypoints` | The `API_CONFIG` declaration elevated for client use, so the middleware can call it |

## Usage

Both halves are needed: the middleware does the work, the entrypoint is what it calls.

```typescript
import { apiConfigMiddleware, entrypoints as apiConfigEntrypoints } from '@owlmeans/api-config-client'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makeClientContext(cfg) as T
  context.registerMiddleware(apiConfigMiddleware)
  return context
}

export const appEntrypoints = [...apiConfigEntrypoints, ...myEntrypoints]
```

A panel app on `@owlmeans/web-panel` or `@owlmeans/mui-panel` already registers both — do it again
only in a context built from a lower layer.

## What the middleware does

It runs once during `init()`, as a `Context`/`Loading` middleware — after every service and
resource has initialized and just before the context is marked ready. So the merged values are
there for anything that reads `cfg` at request or render time, but **not** for a value a service
captured while initializing: that one still holds what the bundle shipped.

- **Both halves, or the boot dies.** The middleware resolves `API_CONFIG` against the context
  before it tests anything else, so a context that registers `apiConfigMiddleware` without also
  spreading `entrypoints` fails `init()` with `SyntaxError: Entrypoint api-config:advertise not
  found`. That failure is outside the swallowing below — it is a hard boot error, not a missing
  value discovered later.
- **It is a no-op unless `cfg.primaryHost` is set.** A build without it keeps whatever the bundle
  was compiled with, silently. That is the first thing to check when a client boots with a config
  the backend does not agree with.
- `cfg.primaryHost` (and `cfg.primaryPort`, when given) are written onto the entrypoint's route
  before the call, so the config is fetched from the primary backend rather than from wherever the
  entrypoint would otherwise resolve.
- The answer is merged into `context.cfg` in place by `mergeConfig` from `@owlmeans/config`:
  objects are merged key by key, two arrays are **appended**, and the server's value replaces the
  built-in one only where that built-in is a scalar, `null` or absent. Where the built-in is an
  object or an array and the server sends a scalar, the merge recurses into that pair, matches
  neither branch and returns the built-in untouched — **the server's value is silently dropped**.
  An array the bundle already carries therefore grows on every merge, and can be neither replaced
  nor emptied from the server.
- A failed **fetch** is logged and swallowed — only the call and the merge are inside the
  try/catch. The app continues on its built-in config, so a misconfigured or unreachable primary
  host shows up as missing values later, never as a boot error.

## Depends On

Declared: `@owlmeans/api-config`, `@owlmeans/client-entrypoint`, `@owlmeans/client-context`,
`@owlmeans/context`.

Imported but **not** declared in this package's manifest: `@owlmeans/config` (`mergeConfig`, which
does the merging described above). A workspace resolves it anyway; a standalone install has to name
it in its own dependencies.
