# @owlmeans/api-config-server

Server-side entrypoint that serves safe configuration values at `GET /assets/config.json`.

## Overview

- Registers the `API_CONFIG` handler that returns non-sensitive config fields to clients
- Used alongside `@owlmeans/api-config-client` to push runtime config from server to browser
- Include this package's local bindings in your server entrypoint registration

## Installation

```bash
bun add @owlmeans/api-config-server@^0.1.18-rc.25
```

## Usage

```typescript
import { entrypoints as apiConfigBindings } from '@owlmeans/api-config-server'

// In your server context setup: this is a local binding list, not a shared declaration tree.
context.registerEntrypoints([...serverBindings, ...apiConfigBindings])
```

## API

### `entrypoints`

Local server bindings for the shared `advertise` protocol (`GET /assets/config.json`).

## Related Packages

- [`@owlmeans/api-config`](../api-config) — shared types and entrypoint alias
- [`@owlmeans/api-config-client`](../api-config-client) — client that fetches this endpoint

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
