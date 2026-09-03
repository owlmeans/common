---
name: api
description: How to use @owlmeans/api — the axios-based HTTP client service that carries entrypoint calls between services. Auto-invoked when importing the API client or when ctx.entrypoint(...).call() under the hood is involved.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/api

**Layer:** Core
**Install:** `"@owlmeans/api": "^0.1.18-rc.13"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `createApiService(alias?)` | Factory for the HTTP client service (axios) |
| `appendApiClient(ctx, alias?)` | Register it and make it the context's default `webService` |
| `ApiClient` | Service interface — a single `handler(req, reply)` |
| `ApiError`, `ApiClientError`, `ServerCrashedError`, `ServerAuthError` | Typed transport errors |
| Constants | Status codes (`OK`, `CREATED`, `ACCEPTED`, `FINISHED`, `UNAUTHORIZED_ERROR`, `FORBIDDEN_ERROR`, `SERVER_ERROR`), `DEFAULT_ALIAS` (`web-client`) |

## How a call is carried

`ep.call(...)` / `ep.invoke(...)` hand the request to whatever is bound to the route's protocol. When
a transport service is registered under `transportAlias(protocol)` it takes the call; otherwise this
package's client does, over HTTP. Either way the consumer writes the same line and never learns which
one ran.

When it is this client, the entrypoint answers where it lives — `path()` for the path, `address()` for
host, port, base, protocol and whether the hop is TLS — and `makeSecurityHelper` assembles the URL from
that. A per-request `host`, `base` or `unsecure` still overrides it. `:params` come from
`request.params` and a missing one is a `SyntaxError`, not a literal `:id` in the URL.

Replies map by status: 200/202 resolve with an outcome, 201/204 resolve with the body or the response
headers when the body is empty, and anything else rejects — a text body is rehydrated into the original
`ResilientError`, otherwise it becomes `ServerCrashedError` (500), `ServerAuthError` (401) or
`ApiClientError` (403 and the rest).

Building a URL without making the call is a different question — that is `entrypointUrl` from
`@owlmeans/client-entrypoint/utils`, or `ep.url(req, { absolute })`.

## Usage

Most apps don't import this directly — they register it once in their context factory:

```typescript
import { appendApiClient } from '@owlmeans/api'
appendApiClient(context)
```

## Depends On

- `@owlmeans/context` — service registration
- `@owlmeans/entrypoint` — the entrypoint being addressed, `@owlmeans/client-route` — `extractParams`
- `@owlmeans/config` — `makeSecurityHelper`
- `@owlmeans/error`, `@owlmeans/i18n`
- `axios`, `qs` (runtime)
