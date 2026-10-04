# @owlmeans/iam

Provider-agnostic IAM abstraction for the OwlMeans framework — `IamService` interface, client/realm types, and permission helpers.

## Overview

- `IamService` — unified interface for provisioning clients, realms, and permissions across IAM backends (e.g. Keycloak, built-in)
- `IamClient` / `IamCredentialsPair` / `IamResourceSpec` — shared contract types used by server-side IAM implementations
- `IamPermissionArgs` — describes a named permission: resource and organization binding (`resourceScoped`, `entityScoped`), title, area and `defaultClass`
- Tenancy facets on `IamService` — `organizations`, `groups`, `subjects` — and `unsupportedFacet` for a backend without them
- `makeIamRuntimeProtocols` — declarations of the provider's runtime IAM API (organizations, members, permissions, grants)
- `hasPermission` — utility to check whether a set of grants covers a given permission, resource and acting organization
- Errors: `IamError` and subtypes for client, permission, user, organization and group failures

## Installation

```bash
bun add @owlmeans/iam@^0.1.18-rc.48
```

## Usage

```typescript
import type { IamService, IamClient } from '@owlmeans/iam'
import { hasPermission } from '@owlmeans/iam'

// Check whether an auth payload grants a permission for one record, in the organization the request acts in
const allowed = hasPermission(auth, 'order--edit', { resourceId: 'ord-1', entitySlug: 'acme' })
```

Typically consumed via `@owlmeans/server-iam` which wires the concrete OIDC-backed implementation.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.47
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
