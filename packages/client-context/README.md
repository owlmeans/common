# @owlmeans/client-context

Client-side context factory extending `BasicContext` with API client and service routing.

## Overview

- `makeClientContext(cfg)` creates a client context with HTTP API client pre-configured
- Adds `ClientContext` capabilities: service URL resolution, API route calls
- Base for higher-level context factories (`@owlmeans/web-client`'s `makeContext`)
- Usually not used directly — use `makeContext` from your platform-specific package

## Installation

```bash
bun add @owlmeans/client-context@^0.1.18-rc.12
```

## Usage

Typically called through a higher-level factory:

```typescript
// Via @owlmeans/web-client
import { makeContext } from '@owlmeans/web-client'
const context = makeContext(appConfig)
```

Direct usage:

```typescript
import { makeClientContext } from '@owlmeans/client-context'
const context = makeClientContext(clientConfig)
```

## API

### `makeClientContext<C, T>(cfg): T`

Creates a client context configured for API calls.

### `ClientContext<C>`

Extends `BasicContext<C>` with:
- Service URL resolution for configured service routes

## Related Packages

- [`@owlmeans/context`](../context) — `BasicContext` base
- [`@owlmeans/web-client`](../web-client) — wraps this with React Router integration
- [`@owlmeans/client-config`](../client-config) — `addWebService` for service URL config

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
