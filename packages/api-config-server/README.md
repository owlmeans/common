# @owlmeans/api-config-server

Server-side module that serves safe configuration values at `GET /assets/config.json`.

## Overview

- Registers the `API_CONFIG` handler that returns non-sensitive config fields to clients
- Used alongside `@owlmeans/api-config-client` to push runtime config from server to browser
- Include `modules` in your server module registration

## Installation

```bash
bun add @owlmeans/api-config-server
```

## Usage

```typescript
import { modules as apiConfigModules } from '@owlmeans/api-config-server'

// In your server context setup
context.registerModules([...appModules, ...apiConfigModules])
```

## API

### `modules`

Array of server-side route handlers for the config advertisement endpoint (`GET /assets/config.json`).

## Related Packages

- [`@owlmeans/api-config`](../api-config) — shared types and module alias
- [`@owlmeans/api-config-client`](../api-config-client) — client that fetches this endpoint

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
