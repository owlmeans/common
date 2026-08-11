---
name: client-entrypoint
description: How to use @owlmeans/client-entrypoint — client-side entrypoint helpers extending @owlmeans/entrypoint with React component attachment and call helpers. Auto-invoked when importing client entrypoint helpers. Also covers the deprecated @owlmeans/client-module reexport shim.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-entrypoint

**Layer:** Client
**Install:** `"@owlmeans/client-entrypoint": "^0.1.15"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ClientEntrypoint<T>` types | Client entrypoint interface (handler component + call helpers) |
| `EntrypointCall` / `EntrypointFilter` | Typed call and validation helpers |
| `EntrypointRef` / `RefedEntrypointHandler` | Handler reference pattern |
| Entrypoint helpers | Build client entrypoints; resolve callable references |

## Subpath Exports

- `./utils`

## Usage

Most app code uses `elevate()` from `@owlmeans/web-client` (which builds on this). Use this directly only for cross-platform entrypoint helpers.

```typescript
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
```

## URL Generation via Entrypoint Call

Entrypoints with a `handler` (React component) use `urlCall` internally — calling `.call()` returns a URL string. Use `{ full: true }` to get a fully-qualified URL via `makeSecurityHelper`:

```typescript
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { HOME } from '@owlmeans/context'

const [url] = await context.entrypoint<ClientEntrypoint<string>>(HOME).call({ full: true }) ?? []
// Returns e.g. "https://app.example.com/"
```

This is the preferred pattern for redirect URIs and navigation targets instead of manual `window.location` concatenation.

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/client-route`, `@owlmeans/client-context`
