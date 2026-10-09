# @owlmeans/server-iam

One-call OIDC RP wiring and IAM gate for OwlMeans servers — `appendIam()` and the permission-asserting `makeIamGate`.

## Overview

- `appendIam(context)` — registers the OIDC client, wrapping service, and IAM gate in a single call, replacing verbose manual wiring
- `makeIamGate()` — produces a guard that asserts unscoped or resource-scoped permissions against the IAM backend (claims-first, UMA2 fallback)
- Re-exports `hasPermission` from `@owlmeans/iam` for inline permission checks
- `makeOrganizationScope(context, request)` — `.organizationOf(slug)` / `.organizationsOf()`: the organizations of a tenanted session, from its session record
- `makeIamRuntimeClient(context, request)` — a typed client of the provider's runtime IAM API, acting as the request's subject
- Designed for IAM consumers such as the viable target template backend

## Installation

```bash
bun add @owlmeans/server-iam@^0.1.18-rc.59
```

## Usage

```typescript
import { appendIam, makeIamGate } from '@owlmeans/server-iam'
import { IAM_GATE } from '@owlmeans/server-iam'
import { contract, protocol, typed } from '@owlmeans/entrypoint'
import { route } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'

// Wire IAM into a server context
appendIam(context)

// Gate a protocol with a permission check
protocol(
  route('users', '/users'),
  contract(typed<User[]>()),
  { guards: DEFAULT_GUARD, gate: { alias: IAM_GATE, params: ['manage-users@{entity}'] } },
)
```

Requires `@owlmeans/oidc` OIDC shared config and a running IAM provider configured via `@owlmeans/server-oidc-rp`.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
