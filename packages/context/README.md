# @owlmeans/context

Lightweight dependency injection and service lifecycle management for fullstack OwlMeans applications.

## Overview

- Context holds services, modules, and resources; passed top-down through the app
- Services are registered by alias and retrieved via `context.service(alias)`
- Supports layered contexts (System → Global → Service → Entity → User) for multi-tenant apps
- Route constants (`ROOT`, `HOME`, `GUEST`, `BASE`) are used by the module system across all packages

## Installation

```bash
bun add @owlmeans/context
```

## Usage

Creating and registering a service:

```typescript
import { createService } from '@owlmeans/context'

export const makeIamService = (alias: string = IAM_SERVICE) => {
  const service = createService<IamService>(alias, {
    getEntityAdminConfig: async (entityId) => {
      const ctx = service.assertCtx<Config, Context>()
      return ctx.service<KeycloakService>(KC_SERVICE).getConfig(entityId)
    }
  })
  return service
}
```

Registering and retrieving services from context:

```typescript
const context = makeBasicContext(config)
context.registerService(makeIamService())

await context.configure().init()

const iamService = context.service<IamService>(IAM_SERVICE)
```

## API

### `createService<S>(alias, implementation): S`

Creates a service registered under `alias`. Inside method implementations, call `service.assertCtx()` to get the current context.

### `createLazyService<S>(alias, implementation): S`

Like `createService` but initialized on first access via `lazyInit()`.

### `appendContextual(alias, obj): Contextual`

Wraps a plain object as a contextual entity (adds `registerContext`, `assertCtx`, etc.).

### `assertContext(ctx, location?): T`

Asserts that a context is defined; throws if not.

### `makeBasicContext<C>(cfg): BasicContext<C>`

Creates a context from a config object. Rarely used directly — prefer the higher-level `makeContext` from `@owlmeans/server-app` or `@owlmeans/client-context`.

### Enums

```typescript
enum Layer { System, Global, Service, Entity, User }
enum AppType { Backend, Frontend }
enum ContextStage { Configuration, Loading, Ready }
```

### Route Constants

```typescript
ROOT   // intermediate base route
HOME   // default/home route
GUEST  // unauthenticated area
BASE   // authenticated area
CRASH  // error fallback screen
```

## Related Packages

- [`@owlmeans/config`](../config) — configuration builder used with context
- [`@owlmeans/server-context`](../server-context) — server-side context extension
- [`@owlmeans/client-context`](../client-context) — client-side context extension
- [`@owlmeans/server-app`](../server-app) — top-level server context factory

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
