# @owlmeans/client-config

Client-side configuration helper for registering web service endpoints.

## Overview

- `addWebService(cfg, alias, url)` — add a named web service URL to a client config
- Used when configuring which URLs the client uses to reach backend services
- Re-exported from `@owlmeans/server-app` for convenience in full-stack config setup

## Installation

```bash
bun add @owlmeans/client-config@^0.1.18-rc.11
```

## Usage

```typescript
import { addWebService } from '@owlmeans/client-config'
// or via server-app:
import { addWebService } from '@owlmeans/server-app'

const appConfig = config(AppType.Frontend, 'manager-web')
addWebService(appConfig, 'api', 'https://api.example.com')
```

## API

### `addWebService(cfg, alias, url): void`

Registers a web service under `alias` in the config. The client resolves `alias` to `url` when making API calls.

### `ClientConfig`

Extends `BasicConfig` with `web?: Record<string, string>` (service alias → URL map).

## Related Packages

- [`@owlmeans/config`](../config) — base config utilities
- [`@owlmeans/client-context`](../client-context) — context that uses the web service config

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
