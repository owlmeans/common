# @owlmeans/web-flow

Web-specific flow service — extends `@owlmeans/client-flow` with URL query parameter persistence and browser navigation.

## Overview

- `makeFlowService(alias?)` — creates a flow service that reads/writes flow state from URL query params
- `appendFlowService(ctx, alias?)` — registers the flow service in the context
- Adds `goHome(alias?, dryRun?)` to navigate to the configured home service URL
- `QUERY_PARAM` / `SERVICE_PARAM` — query parameter names for flow and service routing

## Installation

```bash
bun add @owlmeans/web-flow
```

## Usage

Register in context setup:

```typescript
import { appendFlowService } from '@owlmeans/web-flow'

appendFlowService(context)
```

Use the flow service in a component:

```typescript
import type { FlowService } from '@owlmeans/web-flow'
import { STD_OIDC_FLOW } from '@owlmeans/flow'

const flowSrv = context.service<FlowService>('flow')
await flowSrv.ready()

const flow = await flowSrv.begin(STD_OIDC_FLOW)
flow.target(IAM_WL)
flow.entity(entityId)
const transit = flow.serialize()

const url = `${authUrl}?flow=${transit}`
window.open(url, '_blank')
```

## API

### `makeFlowService(alias?): FlowService`

Creates a flow service. On initialization, reads `?flow=` and `?service=` from the current URL to resume in-progress flows.

### `appendFlowService<C, T>(ctx, alias?): T`

Appends the flow service to the context. Returns the context.

### `FlowService`

Extends `ClientFlowService` with:
- `goHome(alias?, dryRun?): Promise<string>` — navigate to the home URL for the service

### Constants

- `QUERY_PARAM` — `'flow'` — URL query parameter carrying serialized flow state
- `SERVICE_PARAM` — `'service'` — URL query parameter for service routing

## Related Packages

- [`@owlmeans/client-flow`](../client-flow) — `FlowService` base and `createFlowClient`
- [`@owlmeans/flow`](../flow) — `STD_OIDC_FLOW`, `FlowModel`, `FlowConfig`
- [`@owlmeans/web-client`](../web-client) — registers this service when `makeContext` is called with flow support

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
