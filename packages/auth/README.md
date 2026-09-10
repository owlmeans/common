# @owlmeans/auth

Core authentication types, schemas, and constants for OwlMeans fullstack applications.

## Overview

- Defines the shared `Auth`, `AuthCredentials`, `AuthPayload`, and `AuthToken` types used by all auth-related packages
- Provides AJV schemas for validating auth requests (`AuthCredentialsSchema`, `AllowanceRequestSchema`, etc.)
- Defines the `AuthRole` and `AuthenticationStage` enums used across server and client
- Used in request handlers to access `req.auth` and throw typed auth errors

## Installation

```bash
bun add @owlmeans/auth@^0.1.18-rc.8
```

## Usage

Throw a typed auth error when a request lacks an entity:

```typescript
import { AuthUnknown } from '@owlmeans/auth'

export const create = handleBody(async (body, context, request) => {
  if (request.auth?.entityId == null) {
    throw new AuthUnknown('entity')
  }
  // ...
})
```

Check authentication stage in a WebSocket connection:

```typescript
import { AuthenticationStage } from '@owlmeans/auth'

if (connection.stage !== AuthenticationStage.Authenticated) {
  throw new AuthUnknown('not-authenticated')
}
```

## API

### Types

- `Auth` — the auth object attached to `request.auth`; contains `userId`, `entityId`, `role`, `scopes`
- `AuthCredentials` — signed credential payload with `challenge`, `credential`, `publicKey`
- `AuthPayload` — base payload with `type`, `role`, `userId`, `profileId`, `expiresAt`
- `AuthToken` — JWT-like token structure

### Enums

```typescript
enum AuthRole { User, Guest, Service, System, Admin, Superuser, Blocked }
enum AuthenticationType { BasicEd25519, OneTimeToken, ReCaptcha }
enum AuthenticationStage { /* connection auth lifecycle */ }
```

### Errors

- `AuthUnknown` — thrown when a request is missing or has invalid auth

## Product-Viable Integration Notes

- Manager API handlers use `AuthUnknown('entity')` when `request.auth?.entityId` is missing.
- WebSocket helpers use `Auth`, `AuthToken`, and `AuthenticationStage` to authenticate token-bearing connections.
- Google/OIDC login is normalized into an `AuthPayload` with `userId`, `profileId`, `entityId`, and `scopes`; the local identity store lives in `@owlmeans/server-auth-identity`.
- Gate denial should use `AuthForbidden`; product ownership checks should stay in entrypoint gates or handlers, not in this core package.

### AJV Schemas (for entrypoint filter definitions)

- `AuthCredentialsSchema` — validates an auth credential request body
- `AllowanceRequestSchema` — validates an allowance/init request body
- `AuthTokenSchema` — validates query params containing an auth token

## Related Packages

- [`@owlmeans/auth-common`](../auth-common) — auth entrypoints, guards, and middleware
- [`@owlmeans/server-auth`](../server-auth) — server-side auth service implementation
- [`@owlmeans/client-auth`](../client-auth) — client-side auth service

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
