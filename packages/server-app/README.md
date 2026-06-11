# @owlmeans/server-app

The main entry point for OwlMeans backend services — aggregates server packages and provides the `makeContext` + `main` bootstrap functions.

## Overview

- `makeContext(cfg)` creates a fully initialized server context with Fastify, auth, WebSocket, and static resource support
- `main(ctx, entrypoints)` registers entrypoints, initializes the context, and starts the HTTP server
- Re-exports the most commonly used symbols from lower-level packages so backend code has a single import target
- Used by every service in the viable monorepo

## Installation

```bash
bun add @owlmeans/server-app
```

## Usage

Bootstrap a backend service:

```typescript
import { makeContext, main, modules, config, service, AppType, Layer } from '@owlmeans/server-app'

const appConfig = config(
  AppType.Backend,
  'manager-api',
  service({ service: 'mongo', host: process.env.MONGO_HOST!, port: 27017 }),
  { layer: Layer.Service, port: 3000 }
)

const context = makeContext(appConfig)
await main(context, [...modules, ...appModules])
```

Elevate an entrypoint with a handler:

```typescript
import { elevate, handleBody, guard, GUARD_ED25519, modules } from '@owlmeans/server-app'

elevate(modules, 'project-create', handleBody<CreateProject>(async (payload, ctx) => {
  return await (ctx as Context).project().create(payload)
}), guard(GUARD_ED25519))
```

## API

### `makeContext<C, T>(cfg, customize?): T`

Creates a server context with Fastify HTTP, WebSocket, static resources, and auth guard set up. Pass `customize: true` to skip the default auth setup.

### `main<R, C, T>(ctx, entrypoints): Promise<void>`

Registers entrypoints, calls `configure().init()`, then starts the Fastify server.

### Re-exported symbols (for convenience)

| Symbol | Source |
|---|---|
| `handleBody`, `handleParams`, `handleRequest` | `@owlmeans/server-api` |
| `elevate`, `entrypoint`, `guard` | `@owlmeans/server-entrypoint` |
| `celevate` | `@owlmeans/client-entrypoint` |
| `route` | `@owlmeans/route` |
| `broute` | `@owlmeans/server-route` |
| `filter`, `body`, `params`, `parent`, `EntrypointOutcome` | `@owlmeans/entrypoint` |
| `config`, `service`, `sservice`, `toConfigRecord` | various config packages |
| `AppType`, `Layer`, `BASE`, `assertContext` | `@owlmeans/context` |
| `DAUTH_GUARD` | `@owlmeans/server-auth` |
| `GUARD_ED25519`, `BED255_CASHE_RESOURCE` | `@owlmeans/auth-common` |
| `klusterize` | `@owlmeans/kluster` |
| `Request`, `Response`, `CommonEntrypoint`, `ClientEntrypoint` | type re-exports |

### `modules`

Default entrypoint array providing auth and API config routes. Spread into `main()`:
```typescript
await main(context, [...modules, ...myModules])
```

## Related Packages

- [`@owlmeans/server-context`](../server-context) — `makeServerContext` called internally by `makeContext`
- [`@owlmeans/server-api`](../server-api) — handler wrappers re-exported here
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — `elevate` re-exported here

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
