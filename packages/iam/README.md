# @owlmeans/iam

Provider-agnostic IAM abstraction for the OwlMeans framework — `IamService` interface, client/realm types, and permission helpers.

## Overview

- `IamService` — unified interface for provisioning clients, realms, and permissions across IAM backends (e.g. Keycloak, built-in)
- `IamClient` / `IamCredentialsPair` / `IamResourceSpec` — shared contract types used by server-side IAM implementations
- `IamPermissionArgs` — describes a named permission including resource-scope and human-readable title
- `hasPermission` — utility to check whether a set of grants covers a given permission/resource pair
- Errors: `IamError` and subtypes for client-provisioning and permission failures

## Installation

```bash
bun add @owlmeans/iam@^0.1.18-rc.15
```

## Usage

```typescript
import type { IamService, IamClient } from '@owlmeans/iam'
import { hasPermission } from '@owlmeans/iam'

// Check whether an auth payload includes a required permission
const allowed = hasPermission(auth, { permission: 'manage-users', resourceScoped: false })
```

Typically consumed via `@owlmeans/server-iam` which wires the concrete OIDC-backed implementation.

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
