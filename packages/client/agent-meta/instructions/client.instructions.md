---
description: "How to use @owlmeans/client — platform-agnostic React client framework (works with web and React Native) providing context, components, services, navigate, store."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client

**Layer:** Client
**Install:** `"@owlmeans/client": "^0.1.15"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `App` / context helpers | Mount the React app, provide context |
| `navigate` helpers | Programmatic navigation |
| `module` helpers | Resolve modules by alias |
| `store` helpers | Client store integration |
| `components` | Cross-platform components |
| Errors | Client-side typed errors |
| Constants | Default aliases |

## Subpath Exports

- `./utils`

## Usage

```typescript
import { navigate } from '@owlmeans/client'
const navigateTo = navigate(context)
navigateTo('/projects')
```

For browser apps prefer `@owlmeans/web-client`.

## Depends On

- `@owlmeans/client-context`, `@owlmeans/client-entrypoint`, `@owlmeans/client-route`, `@owlmeans/router`, `@owlmeans/auth-common`, `react`
