# @owlmeans/api

HTTP API client service for OwlMeans client contexts — carries entrypoint calls with auth token injection.

## Overview

- `createApiService(alias?)` — creates an HTTP API client service
- `appendApiClient(ctx, alias?)` — registers the API client in the context
- `ApiClient` — the service interface; handles `GET`/`POST`/`PUT`/`DELETE` requests
- Error classes: `ApiError`, `ApiClientError`, `ServerCrashedError`, `ServerAuthError`

## Installation

```bash
bun add @owlmeans/api@^0.1.18-rc.48
```

## Usage

The API client is registered automatically by `@owlmeans/web-client`'s `makeContext`. Direct use is only needed for custom setups:

```typescript
import { appendApiClient } from '@owlmeans/api'

appendApiClient(context)
```

HTTP status constants:

```typescript
import { OK, CREATED, UNAUTHORIZED_ERROR, NOT_FOUND_ERROR } from '@owlmeans/api'
```

## API

### `createApiService(alias?): ApiClient`

Creates an HTTP client service. `alias` defaults to `DEFAULT_ALIAS` (`'web-client'`).

### `appendApiClient<C, T>(ctx, alias?): T`

Registers the API client in the context.

### Request bodies

Objects and arrays go as JSON. A string, number or boolean body on a `POST` without a
`content-type`, or under a JSON `content-type` on any method, is `JSON.stringify`'d, so the server
parses back the same value (`'abc'` travels as `"abc"`). A string that already is JSON text is sent
as it is — except under a `type: 'string'` body contract, where only a JSON string literal counts
as serialized and `'123'` arrives as the string `'123'`.

### Error Classes

- `ApiError` — base API error
- `ApiClientError` — client-side request error
- `ServerCrashedError` — 5xx response
- `ServerAuthError` — 401/403 response

### Constants

`DEFAULT_ALIAS`, `OK`, `CREATED`, `UNAUTHORIZED_ERROR`, `NOT_FOUND_ERROR`, `SERVER_ERROR`

## Related Packages

- [`@owlmeans/client-entrypoint`](../client-entrypoint) — bound protocols use this service to make requests
- [`@owlmeans/web-client`](../web-client) — registers this service via `makeContext`

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
