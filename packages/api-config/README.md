# @owlmeans/api-config

Shared module for advertising safe config values from server to client via a REST endpoint.

## Overview

- Exposes a `GET /assets/config.json` module that returns non-sensitive config fields
- `ApiConfig` — the advertised config type (subset of `CommonConfig`)
- `API_CONFIG` — module alias for the config endpoint
- `notAdvertizedConfigKeys` / `allowedConfigRecords` — lists controlling what is/isn't exposed

## Installation

```bash
bun add @owlmeans/api-config
```

## Usage

Use with server and client counterparts — this package provides the shared types and module alias:

```typescript
import { API_CONFIG } from '@owlmeans/api-config'
import type { ApiConfig } from '@owlmeans/api-config'
```

## API

### `ApiConfig`

Subset of `CommonConfig` safe to expose to clients (no db credentials, secrets, etc.).

### `API_CONFIG`

Module alias `'api-config:advertise'` used to register/call the config endpoint.

### `modules`

Array of route definitions for the config advertisement endpoint.

## Related Packages

- [`@owlmeans/api-config-server`](../api-config-server) — server-side module that serves the config
- [`@owlmeans/api-config-client`](../api-config-client) — client middleware that fetches and merges config

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
