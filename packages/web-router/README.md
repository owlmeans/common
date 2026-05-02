# @owlmeans/web-router

React Router DOM integration for the OwlMeans context system.

## Overview

- `makeWebRouterService()` — creates a router service backed by React Router DOM
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

Creates a router service with React Router DOM hooks and components.

### `appendWebRouter<C, T>(ctx): void`

Registers the web router service in the given context.

## Related Packages

- [`@owlmeans/router`](../router) — `RouterService` base interface
- [`@owlmeans/web-client`](../web-client) — calls `appendWebRouter` inside `makeContext`
