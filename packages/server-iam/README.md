# @owlmeans/server-iam

One-call OIDC RP wiring and IAM gate for OwlMeans servers — `appendIam()` and the permission-asserting `makeIamGate`.

## Overview

- `appendIam(context)` — registers the OIDC client, wrapping service, and IAM gate in a single call, replacing verbose manual wiring
- `makeIamGate()` — produces a guard that asserts unscoped or resource-scoped permissions against the IAM backend (claims-first, UMA2 fallback)
- Re-exports `hasPermission` from `@owlmeans/iam` for inline permission checks
- Designed for IAM consumers such as the viable target template backend

## Installation

```bash
bun add @owlmeans/server-iam@^0.1.18-rc.20
```

## Usage

```typescript
import { appendIam, makeIamGate } from '@owlmeans/server-iam'
import { IAM_GATE } from '@owlmeans/server-iam'
import { entrypoint, guard, route } from '@owlmeans/server-app'
import { gate } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'

// Wire IAM into a server context
appendIam(context)

// Gate an entrypoint with a permission check
entrypoint(route('users', '/users'), guard(DEFAULT_GUARD, gate(IAM_GATE, ['manage-users@{entity}'])))
```

Requires `@owlmeans/oidc` OIDC shared config and a running IAM provider configured via `@owlmeans/server-oidc-rp`.

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
