# @owlmeans/api-config

Shared entrypoint for advertising safe config values from server to client via a REST endpoint.

## Overview

- Exposes a `GET /assets/config.json` entrypoint that returns package-allowlisted config fields
- `ApiConfig` — the advertised config type (subset of `CommonConfig`)
- `API_CONFIG` — entrypoint alias for the config endpoint
- `apiConfigPlugin` / `every` — import-time allowlist helpers for package-owned client config

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

Partial public config assembled only from imported packages' allowlist plugins. Unregistered
server values — including databases, queues and secrets — are never returned.

### `API_CONFIG`

Entrypoint alias `'api-config:advertise'` used to register/call the config endpoint.

### `apiConfigPlugin`

Call this once at module scope in the package that owns a client-facing configuration field:

```typescript
import { apiConfigPlugin, every } from '@owlmeans/api-config'

apiConfigPlugin({
  allow: { integrations: every(true) },
  deny: { integrations: every({ token: true }) },
})
```

The `deny` selector removes nested values after the allowlist selection. Prefer a precise nested
allowlist to `true`; `true` is appropriate only for data that is public at every depth.

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
npx @owlmeans/agent-skills@^0.1.18-rc.18
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
