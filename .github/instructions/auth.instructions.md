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

## Product-Viable Usage Notes

- `product-viable` handlers use `AuthUnknown('entity')` when a request should be authenticated but lacks `req.auth.entityId`.
- WebSocket helpers use `Auth`, `AuthToken`, and `AuthenticationStage` to move token-bearing connections into authenticated state.
- Google/OIDC login ultimately produces a normal `AuthPayload` with `userId`, `profileId`, `entityId`, and `scopes`; `@owlmeans/server-auth-identity` stores that local identity and returns the payload.
- Authorization failures in gates should use `AuthForbidden`, while missing handler auth/entity state usually uses `AuthUnknown`.
- Do not put product ownership rules in `@owlmeans/auth`; downstream apps compose `@owlmeans/module` gates or handler-level entity checks around these core types.

## AuthRole enum

`AuthRole` is a **string** enum (not numeric). Always use enum members — never assign a number literal to `role`:

```typescript
import { AuthRole } from '@owlmeans/auth'

const creds: AuthCredentials = { role: AuthRole.User, ... }
// WRONG: role: 0
```

Members: `User`, `Guest`, `Service`, `System`, `Admin`, `Superuser`, `Blocked`.

## Depends On

- `@owlmeans/error` — base error class
- `@owlmeans/i18n` — translatable error messages
