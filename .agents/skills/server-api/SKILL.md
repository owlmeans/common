---
name: server-api
description: How to use @owlmeans/server-api — Fastify-based API server factory, request/response shapes, server middleware integration. Auto-invoked when importing server-api types or extending the server middleware stack.
user-invocable: false
---

# @owlmeans/server-api

**Layer:** Server
**Install:** `"@owlmeans/server-api": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeServer()` | Factory for the Fastify-based API server |
| `Server`, `ServerRequest`, `ServerResponse` types | Runtime shapes |
| Errors | Typed transport errors |
| Constants | Default ports, paths |
| Helpers | Middleware composition |

## Subpath Exports

- `./utils` — server utility functions

## Usage

The server is normally constructed transparently by `@owlmeans/server-app#main()`. Use `server-api` directly only when you need to register raw Fastify plugins or customize transport:

```typescript
import { makeServer } from '@owlmeans/server-api'
const server = makeServer({ port: 8080 })
context.registerService(server)
```

## Error → HTTP status

`handleError` (`./utils`) is the single mapping from a thrown error to a status. Handlers own no
status table: they throw, and this decides. Two families reach it and both are recognised —
`AccessError` / `AuthFailedError`, raised by this package's own request pipeline, and
`AuthForbidden` / `AuthorizationError` from `@owlmeans/auth`, which is what guards and gates throw.

| Thrown | Status | Meaning |
|--------|--------|---------|
| `AuthForbidden`, `AccessError` | `403` | An established identity that lacks the permission — re-authenticating changes nothing |
| `AuthorizationError`, `AuthFailedError` | `401` | No usable credential: absent, expired, revoked, or naming a session this server does not hold |
| anything else | `500` | |

**Order matters.** `AuthForbidden extends AuthorizationError`, so the 403 branch is tested first —
otherwise every refusal of a permission is reported as a failure to authenticate. And an
unrecognised refusal answering 500 reports a refused request as a crashed server: the client cannot
tell "sign in again" from "the service is broken", and a consumer watching statuses concludes the
application fell over.

The body is always `ResilientError.marshal(ResilientError.ensure(error)).message`, and nothing is
written when the reply was already sent.

## Depends On

- `@owlmeans/context`, `@owlmeans/entrypoint`, `@owlmeans/route`
- `@owlmeans/auth` (the error family the guards throw), `@owlmeans/error`, `@owlmeans/api` (status constants)
- `fastify` (runtime)
