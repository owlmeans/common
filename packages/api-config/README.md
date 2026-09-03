# @owlmeans/api-config

Shared entrypoint for advertising safe config values from server to client via a REST endpoint.

## Overview

- Exposes a `GET /assets/config.json` entrypoint that returns non-sensitive config fields
- `ApiConfig` — the advertised config type (subset of `CommonConfig`)
- `API_CONFIG` — entrypoint alias for the config endpoint
- `notAdvertizedConfigKeys` / `allowedConfigRecords` — lists controlling what is/isn't exposed

## Installation

```bash
bun add @owlmeans/api-config@^0.1.18-rc.11
```

## Usage

Use with server and client counterparts — this package provides the shared types and entrypoint alias:

```typescript
import { API_CONFIG } from '@owlmeans/api-config'
import type { ApiConfig } from '@owlmeans/api-config'
```

## API

### `ApiConfig`

Subset of `CommonConfig` safe to expose to clients (no db credentials, secrets, etc.).

### `API_CONFIG`

Entrypoint alias `'api-config:advertise'` used to register/call the config endpoint.

### `entrypoints`

Array of route definitions for the config advertisement endpoint.

## Related Packages

- [`@owlmeans/api-config-server`](../api-config-server) — server-side entrypoint that serves the config
- [`@owlmeans/api-config-client`](../api-config-client) — client middleware that fetches and merges config

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
