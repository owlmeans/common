# @owlmeans/api-config-client

Client-side middleware that fetches server config from `GET /assets/config.json` and merges it into the client context.

## Overview

- `apiConfigMiddleware` — context middleware that calls the config endpoint on startup
- Binds the `@owlmeans/api-config` `advertise` protocol into the client entrypoint system
- Merges the server `ApiConfig` into the client's `CommonConfig` at initialization time

## Installation

```bash
bun add @owlmeans/api-config-client@^0.1.18-rc.21
```

## Usage

Register the middleware in your client context setup:

```typescript
import { apiConfigMiddleware } from '@owlmeans/api-config-client'

context.registerMiddleware(apiConfigMiddleware)
```

On initialization, the middleware calls the bound `advertise` protocol and merges the response into
the context config. If this package's local `entrypoints` bindings are not registered, initialization
fails rather than silently falling back to alias-based calls.

## API

### `apiConfigMiddleware: Middleware`

A context initialization middleware. Calls the `advertise` protocol, receives `ApiConfig`, and
applies it to the context via `mergeConfig`.

## Related Packages

- [`@owlmeans/api-config`](../api-config) — `API_CONFIG` alias and `ApiConfig` type
- [`@owlmeans/api-config-server`](../api-config-server) — server that serves the config endpoint

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.20
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
