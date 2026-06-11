# @owlmeans/api

HTTP API client service for OwlMeans client contexts — handles module-based requests with auth token injection.

## Overview

- `createApiService(alias?)` — creates an HTTP API client service
- `appendApiClient(ctx, alias?)` — registers the API client in the context
- `ApiClient` — the service interface; handles `GET`/`POST`/`PUT`/`DELETE` requests
- Error classes: `ApiError`, `ApiClientError`, `ServerCrashedError`, `ServerAuthError`

## Installation

```bash
bun add @owlmeans/api
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

### Error Classes

- `ApiError` — base API error
- `ApiClientError` — client-side request error
- `ServerCrashedError` — 5xx response
- `ServerAuthError` — 401/403 response

### Constants

`DEFAULT_ALIAS`, `OK`, `CREATED`, `UNAUTHORIZED_ERROR`, `NOT_FOUND_ERROR`, `SERVER_ERROR`

## Related Packages

- [`@owlmeans/client-module`](../client-module) — `ClientModule<T>` uses this service to make requests
- [`@owlmeans/web-client`](../web-client) — registers this service via `makeContext`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded Claude Code skills and GitHub Copilot instructions under
`agent-meta/`. After installing your `@owlmeans/*` packages, run the OwlMeans
agent-skills installer to place them into your project's native locations
(`.claude/skills/` and `.github/instructions/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
