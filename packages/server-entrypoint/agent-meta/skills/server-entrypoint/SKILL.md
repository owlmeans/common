---
name: server-entrypoint
description: How to use @owlmeans/server-entrypoint — server-side entrypoint helpers extending @owlmeans/entrypoint with handler attachment, request lifecycle hooks. Auto-invoked when importing server-entrypoint types. Also covers the deprecated @owlmeans/server-module reexport shim.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-entrypoint

**Layer:** Server
**Install:** `"@owlmeans/server-entrypoint": "^0.1.9"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ServerEntrypoint` types | Server entrypoint interface (handler + lifecycle) |
| `EntrypointOptions` | Options for elevating with handler, fixer, intermediate |
| `EntrypointRef` / `RefedEntrypointHandler` | Handler reference pattern |
| Helpers | Attach handlers, hook into request lifecycle |

## Usage

Most app code uses `elevate()` from `@owlmeans/server-app` (which builds on this package). Import directly only when implementing custom entrypoint helpers.

```typescript
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
```

## Cross-Service URL Generation

Use `makeSecurityHelper` from `@owlmeans/config` to build URLs pointing at other services (OAuth redirect URIs, webhook callbacks, etc.):

```typescript
import { makeSecurityHelper } from '@owlmeans/config'
const helper = makeSecurityHelper<Config, Context>(ctx)
const url = helper.makeUrl(route, '/callback')
```

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/server-route`, `@owlmeans/server-context`
