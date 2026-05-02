# @owlmeans/api-config-client

Client-side middleware that fetches server config from `GET /assets/config.json` and merges it into the client context.

## Overview

- `apiConfigMiddleware` — context middleware that calls the config endpoint on startup
- Elevates `@owlmeans/api-config` modules into the client module system
- Merges the server `ApiConfig` into the client's `CommonConfig` at initialization time

## Installation

```bash
bun add @owlmeans/api-config-client
```

## Usage

Register the middleware in your client context setup:

```typescript
import { apiConfigMiddleware } from '@owlmeans/api-config-client'

context.registerMiddleware(apiConfigMiddleware)
```

On initialization, the middleware calls the `API_CONFIG` module and merges the response into the context config.

## API

### `apiConfigMiddleware: Middleware`

A context initialization middleware. Calls `API_CONFIG` module, receives `ApiConfig`, and applies it to the context via `mergeConfig`.

## Related Packages

- [`@owlmeans/api-config`](../api-config) — `API_CONFIG` alias and `ApiConfig` type
- [`@owlmeans/api-config-server`](../api-config-server) — server that serves the config endpoint
