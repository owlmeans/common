# @owlmeans/flow

State machine for multi-step user flows, primarily used for OIDC authentication flows.

## Overview

- Defines flow configurations as sequences of steps and transitions
- `STD_OIDC_FLOW` is the standard OIDC authentication flow constant
- `stdOidcFlow` is the preconfigured OIDC flow definition
- Flows are started via `flowService.begin(flowAlias)` and progress through steps as the user authenticates

## Installation

```bash
bun add @owlmeans/flow@^0.1.18-rc.13
```

## Usage

Register the OIDC flow in app config:

```typescript
import { flow, configureFlows, stdOidcFlow } from '@owlmeans/flow'

const appConfig = configureFlows(
  flow(config(AppType.Frontend, 'manager-web'), stdOidcFlow),
  { defaultFlow: STD_OIDC_FLOW }
)
```

Start a flow in a component:

```typescript
import { STD_OIDC_FLOW } from '@owlmeans/flow'

// In a UI action handler
const flowService = context.service(FLOW_SERVICE_ALIAS)
await flowService.begin(STD_OIDC_FLOW)
```

## API

### `STD_OIDC_FLOW`

Constant: `'_oidc'` — alias for the standard OIDC flow.

### `stdOidcFlow: ShallowFlow`

The pre-built standard OIDC authentication flow.

### `flow(cfg, flow): C` / `configureFlows(cfg, config): C`

Add a flow to an application config, and set the flow subsystem's own configuration on it.

### `ShallowFlow`

A flow declaration: `flow` (its alias), `initialStep`, and `steps` keyed by step name.

### `FlowConfig`

The subsystem's configuration: `queryParam`, `services`, `modules`, `pathes`, `defaultFlow`.

### `FlowStep`

A named step: `index`, `step`, `service`, its `transitions`, and optional `path` / `module`.

### `FLOW_RECORD`

Config record type key for registering flows in the application config.

## Related Packages

- [`@owlmeans/client-flow`](../client-flow) — client-side flow service that executes flow steps
- [`@owlmeans/web-flow`](../web-flow) — React components for flow UI rendering

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
