# @owlmeans/server-auth-session

An authorization-freshness registry for OwlMeans bearer and OIDC sessions: every issued session is
registered under an opaque id with an absolute seven-day lifetime, and a profile's authority can be
fenced, then refreshed or revoked, so the next bearer decision sees the change. It ships an
in-memory manager for a single process and an atomic Redis manager for multi-instance deployments.
A server uses it through `@owlmeans/server-auth`: `appendAuthService` already registers the memory
manager when none is present, so an app touches this package directly only to install the Redis
manager or to fence/refresh/revoke a profile after changing its permissions, role or status. It is
not a browser-token store and holds no claims — tokens and their payloads stay with
`@owlmeans/server-auth`.

## Installation

```bash
bun add @owlmeans/server-auth-session@^0.1.18-rc.17
```

## Concepts

- **Session** — an `AuthSessionRecord` addressed by an opaque `id`, of an `AuthSessionKind`
  (`'bearer'`, `'oidc-access'`, `'oidc-refresh'`, `'oidc-provider-session'`), carrying the subject
  version it was issued at and its absolute `expiresAt`.
- **Subject** — the stable selector `{ entityId, profileId, clientId? }` shared by all sessions of
  one profile (per client). `entityId` is storage-only — never the renameable `entitySlug`, and never
  placed in an authentication envelope.
- **Subject state** — `active`, `pending` (fenced while authority changes), `refresh` (claims
  changed; re-issue required), `revoked`. Each completed transition increments the subject
  `version`.
- **Decision** — `AuthSessionDecision`: `{ state: 'active' | 'refresh', version, expiresAt }` or
  `{ state: 'pending' | 'revoked' | 'missing' | 'expired' }`.
- **Fence** — `fence(selector, operationId)` marks the subject pending; only `refresh` or `revoke`
  with the same `operationId` completes it.

## Usage

### Use the Redis manager in a scaled deployment

Register it before `appendAuthService`; both append helpers are idempotent by alias, so the first
one registered wins.

```typescript
import { appendAuthService } from '@owlmeans/server-auth'
import { appendRedisAuthSessionManager } from '@owlmeans/server-auth-session'

appendRedisAuthSessionManager(context)   // registers AUTH_SESSION_RESOURCE as a Redis resource when absent
appendAuthService(context)
```

`appendRedisAuthSessionManager(context, { resourceAlias?, dbAlias?, serviceAlias?, alias?, now? })`
passes `dbAlias` / `serviceAlias` to `makeRedisResource`.

### Change a profile's authority

```typescript
import { AUTH_SESSION_MANAGER } from '@owlmeans/server-auth-session'
import type { AuthSessionManager } from '@owlmeans/server-auth-session'

const sessions = context.service<AuthSessionManager>(AUTH_SESSION_MANAGER)
const selector = { entityId, profileId, clientId }
const operationId = crypto.randomUUID()

await sessions.fence(selector, operationId)        // every session of the subject now answers 'pending'
await profiles.update({ ...profile, role })        // the durable authority change
await sessions.refresh(selector, operationId)      // sessions answer 'refresh' → claims are re-issued
// or, on disable/removal:
await sessions.revoke(selector, operationId)       // sessions answer 'revoked'
```

If the write or the completion fails, leave the subject pending — it is refused until a matching
completion runs.

### Register and inspect a session

```typescript
const issued = await sessions.register({ id: sessionId, kind: 'bearer', entityId, profileId, clientId })
// { state: 'active', version, expiresAt } — expiresAt never exceeds now + AUTH_SESSION_TTL

const decision = await sessions.inspect(sessionId)
```

### Test with a controllable clock

```typescript
import { makeMemoryAuthSessionManager } from '@owlmeans/server-auth-session'

let now = 1_000
const manager = makeMemoryAuthSessionManager({ now: () => now })
await manager.init()
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `AuthSessionManager` | interface | `register(session)`, `inspect(id)`, `fence(selector, op)`, `refresh(selector, op) → version`, `revoke(selector, op) → version` |
| `makeMemoryAuthSessionManager(options?)` | function | process-local manager; state is lost on restart |
| `appendMemoryAuthSessionManager(context, options?)` | function | registers the memory manager unless the alias is taken |
| `makeRedisAuthSessionManager(resourceAlias?, options?)` | function | Redis manager; atomic `SET NX` registration and Lua subject transitions |
| `appendRedisAuthSessionManager(context, options?)` | function | registers the Redis resource (if absent) and the Redis manager (if absent) |
| `AUTH_SESSION_TTL` | const | `7 * 24 * 60 * 60 * 1000` ms — absolute maximum, never extended |
| `AUTH_SESSION_MANAGER` | const | `'auth-session-manager'` — service alias |
| `AUTH_SESSION_RESOURCE` | const | `'auth-session-record'` — Redis resource alias |
| `AuthSessionManagerOptions` | type | `{ alias?, now? }` |
| `AuthSessionSelector`, `RegisterAuthSession` | types | `{ entityId, profileId, clientId? }`; selector + `id`, `kind`, `issuedAt?`, `expiresAt?` |
| `AuthSessionRecord`, `AuthSessionSubject`, `AuthSessionStoredRecord` | types | stored shapes (`record: 'session' \| 'subject'`) |
| `AuthSessionKind`, `AuthSessionState`, `AuthSessionDecision` | types | see Concepts |

## Common pitfalls

- Registering the Redis manager after `appendAuthService` has no effect — the memory manager
  already holds `AUTH_SESSION_MANAGER`.
- The memory manager forgets everything on restart; use it only where another authority decides
  each request live, or in development and tests.
- `register` clamps a caller-supplied `expiresAt` to `AUTH_SESSION_TTL`; re-registering after a
  claim refresh keeps the original absolute expiry.
- A `refresh` or `revoke` whose `operationId` differs from a pending fence does not complete it
  (memory returns the unchanged version; Redis throws `auth-session:transition-conflict`).
- A registry read or write failure is surfaced by `@owlmeans/server-auth` as `AuthUnavailable` (503) —
  never treat it as a missing session or a logout.
- Do not replace the Redis Lua transitions with a read-modify-save sequence; a concurrent fence
  would be overwritten.

## Related packages

- [`@owlmeans/server-auth`](../server-auth) — issues sessions and consults this registry at every bearer decision
- [`@owlmeans/redis-resource`](../redis-resource) — the Redis resource behind the scaled manager
- [`@owlmeans/server-auth-identity`](../server-auth-identity) — identity profiles whose authority changes are fenced here
- [`@owlmeans/context`](../context) — `createService` and the service lifecycle

The `server-auth-session` skill states the fence/refresh/revoke rules for agents.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.51
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
