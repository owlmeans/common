---
description: "How to use @owlmeans/auth — core authentication types, errors (AuthUnknown, AuthError), permissions, allowance, rely, and entity primitives. Use when working with request authentication in handlers."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/auth

**Layer:** Core
**Install:** `"@owlmeans/auth": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `AuthUnknown` | Error thrown when expected entity/auth is missing on a request |
| `AuthError` and subclasses | Typed auth errors mapping to HTTP 401/403 |
| `Auth` types | Request auth payload shape (entityId, scopes, profile) |
| `Permission` helpers | Check scopes/permissions on a request |
| `Allowance` helpers | Inspect/grant allowances |
| `Entity`, `Rely` types | Shared entity-relationship primitives |

## Usage

```typescript
import { AuthUnknown } from '@owlmeans/auth'
import { handleRequest } from '@owlmeans/server-app'

export const list = handleRequest(async (req, context) => {
  if (req.auth?.entityId == null) throw new AuthUnknown('entity')
  return await (context as Context).project().list({ entityId: req.auth.entityId })
})
```

## Depends On

- `@owlmeans/error` — base error class
- `@owlmeans/i18n` — translatable error messages
