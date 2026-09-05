---
name: api
description: How to use @owlmeans/api — the axios-based HTTP client service that carries entrypoint calls between services, its status-to-outcome mapping, typed transport errors and per-request timeout/abort. Auto-invoked when importing the API client, or when ctx.entrypoint(...).call() under the hood is involved.
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
| `appendApiClient(ctx, alias?)` | Register it and make it the context's default `webService` when none is set |
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

A request whose `canceled` flag is already set is dropped without a round trip.

## Per-request controls

These live on the request the caller passes and are forwarded to the transport:

- `timeout` — milliseconds for the single round trip; omitted or `0` means no timeout, so a stuck
  peer hangs forever unless a caller bounds it.
- `signal` — an `AbortSignal`, which aborts the request in flight.
- `headers` — a `content-type` of `application/x-www-form-urlencoded` makes the body serialize
  through `qs` instead of JSON. A string body on a `POST` with no `content-type` gets
  `application/json` and is sent verbatim rather than re-quoted.

## Reading the answer

`validateStatus` is `() => true`, so **no status throws**: every answer the peer sends, 4xx and 5xx
included, comes back and is mapped here.

| Status | Result |
|--------|--------|
| 200 / 202 | Resolves with the body and an `Ok` / `Accepted` outcome |
| 201 / 204 | Resolves with the body, or with the response headers when the body is empty |
| any other | Rejects |

A rejection prefers the server's own error: a text body is rehydrated into the original
`ResilientError`, so a `handleError` reply on the far side arrives as the same class it was thrown
as. Failing that it becomes `ServerCrashedError` (500), `ServerAuthError` (401) or `ApiClientError`
(403 and the rest).

**A failure with no answer at all is a different family.** Suppressing status errors does not wrap
the call: an expired `timeout` (`ECONNABORTED`), an aborted `signal` (`CanceledError` /
`ERR_CANCELED`), a refused connection or a DNS failure rejects with the raw axios error, which is
none of the typed errors above. A caller that bounds a call has to catch that too — testing for
`ApiClientError` alone lets a timeout through as an unhandled rejection.

An `auth-token-refresh` response header is consumed here: when the context has an auth service, the
rotated token is handed to it, which is what keeps a long session alive without the caller doing
anything.

Building a URL without making the call is a different question — that is `entrypointUrl` from
`@owlmeans/client-entrypoint/utils`, or `ep.url(req, { absolute })`.

## Usage

Most apps don't import this directly — they register it once in their context factory:

```typescript
import { appendApiClient } from '@owlmeans/api'
appendApiClient(context)
```

`appendApiClient` only claims `cfg.webService` when it is unset, so an app that has already named a
transport keeps it.

## Depends On

- `@owlmeans/context` — service registration
- `@owlmeans/entrypoint` — the entrypoint being addressed, `@owlmeans/client-route` — `extractParams`
- `@owlmeans/config` — `makeSecurityHelper`, `@owlmeans/client-config` — the config shape
- `@owlmeans/auth-common` — the token-refresh header and the auth service it updates
- `@owlmeans/error`, `@owlmeans/route`
- `axios`, `qs` (runtime)
