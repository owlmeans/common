# @owlmeans/web-wl

Web whitelabel — service factory, entrypoint declarations, and React components for managing whitelabel content in browser apps.

## Overview

- `makeWlService(alias?)` — web-side whitelabel service factory
- `entrypoints` — web-side whitelabel entrypoint declarations
- Components for displaying whitelabel content
- `DEFAULT_ALIAS` — `'wl-web-serivce'`

## Installation

```bash
bun add @owlmeans/web-wl@^0.1.18-rc.14
```

## Usage

Register the service and entrypoint declarations:

```typescript
import { makeWlService, entrypoints as wlEntrypoints } from '@owlmeans/web-wl'

context.registerService(makeWlService())
const entrypoints = [...baseEntrypoints, ...wlEntrypoints, ...appEntrypoints]
```

Downstream variants (e.g., `@owlmeans/web-wl-manager`) extend this with manager-store helpers like `setupWlManagerStore<C, T>(context)`.

## API

### `makeWlService(alias?)`

Creates the web whitelabel service. `alias` defaults to `DEFAULT_ALIAS` (`'wl-web-serivce'`).

### `entrypoints`

Array of web-side entrypoint declarations for whitelabel content.

### Components

React components from `./components` (re-exported at root) for rendering whitelabel content.

### Constants

- `DEFAULT_ALIAS` — `'wl-web-serivce'`

## Related Packages

- [`@owlmeans/wled`](../wled) — shared whitelabel types and constants
- [`@owlmeans/client-wl`](../client-wl) — client-side whitelabel placeholder
- [`@owlmeans/web-client`](../web-client) — base web context this service runs in
- [`@owlmeans/web-panel`](../web-panel) — typical app-side `makeContext` foundation

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
