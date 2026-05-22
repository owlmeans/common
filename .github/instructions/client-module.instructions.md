---
description: "How to use @owlmeans/client-module — client-side module helpers extending @owlmeans/module with React component attachment and call helpers."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/client-module

**Layer:** Client
**Install:** `"@owlmeans/client-module": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ClientSideModule` types | Client module interface |
| Module helpers | Build client modules; resolve callable references |

## Subpath Exports

- `./utils`

## Usage

```typescript
import type { ClientSideModule } from '@owlmeans/client-module'
```

## URL Generation via Module Call

Modules with a `handler` (React component) use `urlCall` internally — calling `.call()` returns a URL string, not an API result. Use `{ full: true }` to get a fully-qualified URL with protocol and host via `makeSecurityHelper`:

```typescript
import type { ClientModule } from '@owlmeans/client-module'
import { HOME } from '@owlmeans/context'

// Get the full URL for the HOME module
const [url] = await context.module<ClientModule<string>>(HOME).call({ full: true }) ?? []

// With route params
const [authUrl] = await context.module<ClientModule<string>>(CAUTHEN_AUTHEN_TYPED).call({
  full: true, params: { type: 'google' }
}) ?? []
```

This is the preferred pattern for building redirect URIs, OAuth callback URLs, and navigation targets instead of manual `window.location` concatenation.

## Depends On

- `@owlmeans/module`, `@owlmeans/client-route`, `@owlmeans/client-context`
