# @owlmeans/flow

State machine for multi-step user flows, primarily used for OIDC authentication flows.

## Overview

- Defines flow configurations as sequences of steps and transitions
- `STD_OIDC_FLOW` is the standard OIDC authentication flow constant
- `stdOidcFlow()` creates the preconfigured OIDC flow definition
- Flows are started via `flowService.begin(flowAlias)` and progress through steps as the user authenticates

## Installation

```bash
bun add @owlmeans/flow
```

## Usage

Register the OIDC flow in app config:

```typescript
import { STD_OIDC_FLOW, stdOidcFlow } from '@owlmeans/flow'

// In app config (added as a config record)
const appConfig = config(
  AppType.Frontend,
  'manager-web',
  // ... other config
  { [FLOW_RECORD]: [stdOidcFlow()] }
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

### `stdOidcFlow(): FlowConfig`

Returns a pre-built `FlowConfig` for the standard OIDC authentication flow.

### `FlowConfig`

A flow configuration object with `alias`, `steps: FlowStep[]`, and `transitions: FlowTransition[]`.

### `FlowStep`

A named step in a flow with optional `service` and `module` references.

### `FLOW_RECORD`

Config record type key for registering flows in the application config.

## Related Packages

- [`@owlmeans/client-flow`](../client-flow) — client-side flow service that executes flow steps
- [`@owlmeans/web-flow`](../web-flow) — React components for flow UI rendering
