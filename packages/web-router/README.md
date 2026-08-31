# @owlmeans/web-router

The default OwlMeans in-browser routing plugin for the OwlMeans context system. It depends on no
third-party router — react-router is a separate opt-in plugin,
[`@owlmeans/web-router-react-router`](../web-router-react-router).

## Overview

- `makeWebRouterService()` — creates a router service backed by the OwlMeans browser router
- `appendWebRouter(ctx)` — registers the web router service in the context
- Provides `useParams`, `useLocation`, `useNavigate`, `outlet()`, `provider()` via the service
- Used internally by `@owlmeans/web-client`'s `makeContext` — not typically used directly

## Installation

```bash
bun add @owlmeans/web-router
```

## Usage

This package is registered automatically when using `makeContext` from `@owlmeans/web-client`. Direct use is only needed for custom context setup:

```typescript
import { appendWebRouter } from '@owlmeans/web-router'

appendWebRouter(context)
```

## API

### `makeWebRouterService(): RouterService`

Creates a router service with the OwlMeans browser router hooks and components.

### `appendWebRouter<C, T>(ctx): void`

Registers the web router service in the given context.

## Related Packages

- [`@owlmeans/router`](../router) — `RouterService` base interface
- [`@owlmeans/web-client`](../web-client) — calls `appendWebRouter` inside `makeContext`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
