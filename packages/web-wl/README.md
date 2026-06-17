# @owlmeans/web-wl

Web whitelabel — service factory, module declarations, and React components for managing whitelabel content in browser apps.

## Overview

- `makeWlService(alias?)` — web-side whitelabel service factory
- `wlModules` (exported as `modules`) — web-side whitelabel module declarations
- Components for displaying whitelabel content
- `DEFAULT_ALIAS` — `'wl-web-serivce'`

## Installation

```bash
bun add @owlmeans/web-wl
```

## Usage

Register the service and module declarations:

```typescript
import { makeWlService, modules as wlModules } from '@owlmeans/web-wl'

context.registerService(makeWlService())
const modules = [...baseModules, ...wlModules, ...appModules]
```

Downstream variants (e.g., `@owlmeans/web-wl-manager`) extend this with manager-store helpers like `setupWlManagerStore<C, T>(context)`.

## API

### `makeWlService(alias?)`

Creates the web whitelabel service. `alias` defaults to `DEFAULT_ALIAS` (`'wl-web-serivce'`).

### `modules`

Array of web-side module declarations for whitelabel content (re-exported as `wlModules` in downstream variants).

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
