---
name: client
description: How to use @owlmeans/client — platform-agnostic React client framework (works with web and React Native) providing context, components, services, navigate, store. Auto-invoked when importing client framework primitives.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client

**Layer:** Client
**Install:** `"@owlmeans/client": "^0.1.16"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `App` / context helpers | Mount the React app, provide context |
| `navigate` helpers | Programmatic navigation via the router service |
| `module` helpers | Resolve modules by alias |
| `store` helpers | Client store integration |
| `components` | Cross-platform components (e.g. error boundaries) |
| `value`, `debug` | Render-time helpers |
| Errors | Client-side typed errors |
| Constants | Default aliases |

## Subpath Exports

- `./utils` — generic client utilities

## Usage

This is the platform-agnostic substrate that `@owlmeans/web-client` (browser) and the native equivalent build on. Most apps import from `@owlmeans/web-client` directly; use `@owlmeans/client` only for cross-platform code.

```typescript
import { navigate } from '@owlmeans/client'
const navigateTo = navigate(context)
navigateTo('/projects')
```

## Depends On

- `@owlmeans/client-context`, `@owlmeans/client-entrypoint`, `@owlmeans/client-route`
- `@owlmeans/router`, `@owlmeans/auth-common`
- `react` (peer)
