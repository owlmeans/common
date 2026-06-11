# @owlmeans/kluster

Kubernetes integration service — service discovery and pod/service IP resolution for cloud-native OwlMeans apps.

## Overview

- `makeKlusterService(alias?)` — creates a Kubernetes API client service
- `klusterize(context, alias?)` — registers the service and its config-resolution middleware
- `KlusterService` — resolves pod hostnames and service cluster IPs, dispatches `kluster:` directives
- Used to resolve `kluster:<selector>` config values to actual pod IPs at runtime

## Installation

```bash
bun add @owlmeans/kluster
```

## Usage

Register in server context setup:

```typescript
import { klusterize, DEFAULT_ALIAS as KLUSTER_SERVICE } from '@owlmeans/kluster'
import type { KlusterService } from '@owlmeans/kluster'

klusterize<C, T>(context)

// Access in context type
context.kluster = () => context.service<KlusterService>(KLUSTER_SERVICE)
```

Config values can reference Kubernetes selectors:

```json
{
  "dbs": {
    "mongo": { "url": "kluster:app=mongo-svc" }
  }
}
```

The middleware resolves `kluster:` prefixed values to real cluster IPs at startup.

## API

### `makeKlusterService(alias?): KlusterService`

Creates the Kubernetes service. Reads in-cluster config or `~/.kube/config`.

### `klusterize<C, T>(context, alias?): T`

Registers the kluster service and a middleware that resolves `kluster:` directives in config.

### `KlusterService`

- `getHostnames(selector, namespace?): Promise<string[]>` — list pod IPs matching a label selector
- `getServiceHostname(selector, namespace?): Promise<string | null>` — get a service's cluster IP
- `dispatch<T>(action, query): Promise<T>` — dispatch a kluster directive query

### `KlusterConfig`

Extends `ServerConfig` with optional `namespace: string`.

## Related Packages

- [`@owlmeans/server-app`](../server-app) — `makeContext` where `klusterize` is typically called
- [`@owlmeans/mongo`](../mongo) — MongoDB URL can be a `kluster:` directive

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
