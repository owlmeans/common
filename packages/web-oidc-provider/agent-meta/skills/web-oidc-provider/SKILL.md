---
name: web-oidc-provider
description: How to use @owlmeans/web-oidc-provider — browser-side state and helpers for an embedded OIDC provider UI (consent, login screens). Auto-invoked when importing OIDC provider state primitives in a web app.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-oidc-provider

**Layer:** Web (React)
**Install:** `"@owlmeans/web-oidc-provider": "^0.1.11"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `auth-state` helpers | OIDC provider login/consent state |
| Types | Provider UI types |
| Constants | Provider state aliases |

## Usage

Use this only when your app hosts the OIDC provider screens (login, consent). For relying-party usage in a web app, use `@owlmeans/web-oidc-rp` instead.

```typescript
import { authState } from '@owlmeans/web-oidc-provider'
```

## Depends On

- `@owlmeans/oidc`, `@owlmeans/web-client`, `@owlmeans/web-panel`
