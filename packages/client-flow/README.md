# @owlmeans/client-flow

Client-side flow orchestration service for managing multi-step workflows in browser environments.

## Overview

- `makeBasicFlowService(alias?)` — creates a flow service for context registration
- `createFlowClient(context, nav)` — creates a `FlowClient` bound to the app context and navigator
- `FlowService` / `FlowClient` — interfaces for flow state management and step transitions
- Used by `@owlmeans/web-flow` to drive navigation through workflow steps

## Installation

```bash
bun add @owlmeans/client-flow@^0.1.18-rc.16
```

## Usage

Register the flow service in context setup:

```typescript
import { makeBasicFlowService } from '@owlmeans/client-flow'

context.registerService(makeBasicFlowService())
```

Create a flow client in a component or hook:

```typescript
import { createFlowClient, DEFAULT_ALIAS as FLOW_ALIAS } from '@owlmeans/client-flow'
import type { FlowService, FlowClient } from '@owlmeans/client-flow'

const service = context.service<FlowService>(FLOW_ALIAS)
await service.ready()

const client = await createFlowClient(context, nav).boot(target)
// Navigate to next step
await client.proceed(transition, request)
```

## API

### `makeBasicFlowService(alias?): FlowService`

Creates the flow service. `alias` defaults to `DEFAULT_ALIAS` (`'flow'`).

### `createFlowClient(context, nav): FlowClient`

Creates a flow client with methods:
- `boot(target, from?)` — load and initialize flow for a target slug
- `setup(flow)` — set the current flow model
- `proceed(transition, req?)` — advance to the next step
- `persist()` — save flow state

### `DEFAULT_ALIAS`

`'flow'` — the default service alias.

### `FLOW_STATE`

`'state:flow'` — key used to store flow state in the client resource layer.

## Related Packages

- [`@owlmeans/flow`](../flow) — `FlowModel`, `FlowConfig`, `FlowTransition` types
- [`@owlmeans/web-flow`](../web-flow) — React hook (`useFlow`) built on top of `createFlowClient`
- [`@owlmeans/client-resource`](../client-resource) — used internally to persist flow state

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
