---
description: "How to use @owlmeans/client-entrypoint — client-side entrypoint helpers extending @owlmeans/entrypoint with React component attachment and call helpers. Also covers the deprecated @owlmeans/client-module reexport shim."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-entrypoint

**Layer:** Client
**Install:** `"@owlmeans/client-entrypoint": "^0.1.9"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ClientEntrypoint<T>` | Client entrypoint interface |
| `EntrypointCall` / `EntrypointFilter` | Typed call and validation helpers |
| Entrypoint helpers | Build client entrypoints; resolve callable references |

## Subpath Exports

- `./utils`

## Usage

```typescript
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
```

## URL Generation via Entrypoint Call

Entrypoints with a `handler` (React component) use `urlCall` internally — calling `.call()` returns a URL string, not an API result. Use `{ full: true }` to get a fully-qualified URL with protocol and host via `makeSecurityHelper`:

```typescript
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { HOME } from '@owlmeans/context'

// Get the full URL for the HOME entrypoint
const [url] = await context.entrypoint<ClientEntrypoint<string>>(HOME).call({ full: true }) ?? []

// With route params
const [authUrl] = await context.entrypoint<ClientEntrypoint<string>>(CAUTHEN_AUTHEN_TYPED).call({
  full: true, params: { type: 'google' }
}) ?? []
```

This is the preferred pattern for building redirect URIs, OAuth callback URLs, and navigation targets instead of manual `window.location` concatenation.

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/client-route`, `@owlmeans/client-context`
