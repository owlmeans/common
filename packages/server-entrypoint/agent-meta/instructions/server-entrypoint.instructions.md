---
description: "How to use @owlmeans/server-entrypoint — server-side entrypoint helpers extending @owlmeans/entrypoint with handler attachment and request lifecycle hooks. Also covers the deprecated @owlmeans/server-module reexport shim."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-entrypoint

**Layer:** Server
**Install:** `"@owlmeans/server-entrypoint": "^0.1.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ServerEntrypoint` types | Server entrypoint interface |
| `EntrypointOptions` | Elevation options (handler, fixer, intermediate) |
| Helpers | Attach handlers, hook lifecycle |

## Usage

```typescript
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
// Most code uses elevate() from @owlmeans/server-app instead
```

## Cross-Service URL Generation

Server entrypoints that need to produce URLs for other services (e.g., OAuth redirect URIs, callback URLs) should use `makeSecurityHelper` from `@owlmeans/config`:

```typescript
import { makeSecurityHelper } from '@owlmeans/config'
const helper = makeSecurityHelper<Config, Context>(ctx)
const callbackUrl = helper.makeUrl(route, '/callback')
```

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/server-route`, `@owlmeans/server-context`
