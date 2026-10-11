---
name: server-auth-session
description: How to use @owlmeans/server-auth-session for absolute seven-day bearer/OIDC session tracking, Redis authority, local memory defaults, and profile-level fence/refresh/revoke decisions. Use when issuing, validating, revoking, or refreshing OwlMeans sessions.
user-invocable: false
---

# @owlmeans/server-auth-session

**Layer:** Server

The session manager is an authorization-freshness registry, not a browser-token store. A session
record is addressed by an opaque id; its subject is the stable `{ entityId, profileId, clientId? }`
selector. `entityId` is storage-only and must never be placed in an authentication envelope.

## Exports

| Export | Purpose |
|---|---|
| `AUTH_SESSION_TTL` | Absolute seven-day maximum; acknowledgement never extends it. |
| `AUTH_SESSION_MANAGER` | Context service alias. |
| `AUTH_SESSION_RESOURCE` | Redis resource alias. |
| `appendMemoryAuthSessionManager(context)` | Process-local default for tests, development and generated targets. |
| `appendRedisAuthSessionManager(context)` | Shared Redis authority for a central/multi-replica issuer. |
| `AuthSessionManager` | `register`, `inspect`, `fence`, `refresh`, `revoke` contract. |

## Rules

- Register the manager before `appendAuthService`. The auth service then issues an opaque session
  id, uses the registry at every bearer decision, and rejects pre-registry tokens after rollout.
- `register` clamps every caller-supplied expiry to `AUTH_SESSION_TTL`. Re-registering after a
  verified claim refresh updates the subject version but preserves the original absolute expiry.
- Before changing a profile's permissions, role, disabled flag or existence, call `fence(selector,
  operationId)`. On a successful durable write call `refresh` for changed claims or `revoke` for
  disablement/removal. If the write or completion fails, leave the subject pending and refuse it.
- Use `appendRedisAuthSessionManager` for viable or any central/scaled issuer. Its Lua transition
  owns the operation id and version atomically; do not replace it with a read-modify-save sequence.
- The memory implementation intentionally forgets state on restart. It is suitable only when a
  separate authority makes a live decision on each request, as viable does for generated targets'
  required OIDC validation.
- A registry read/write failure is an `AuthUnavailable` path (503). Never interpret it as a missing
  session, a logout, or permission to use stale claims.
