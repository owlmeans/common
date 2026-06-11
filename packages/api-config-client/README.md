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
