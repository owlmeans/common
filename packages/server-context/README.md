# @owlmeans/server-context

Server-side context factory with file-based config, trusted keys, and Ed25519 guard pre-wired.

## Overview

- `makeServerContext()` creates a context with file config reader, `PLUGINS` resource, and trusted key management
- Extends `BasicContext` with `ServerContext` which includes API server and auth service append points
- The `config` helper re-exported here configures a `ServerConfig` with `port`, `security`, etc.
- Typically accessed through `@owlmeans/server-app`'s `makeContext`, which calls this internally

## Installation

```bash
bun add @owlmeans/server-context@^0.1.18-rc.11
```

## Usage

Usually called indirectly through `@owlmeans/server-app`:

```typescript
import { makeContext } from '@owlmeans/server-app'
const context = makeContext(appConfig)
```

When building a custom server context:

```typescript
import { makeServerContext, config } from '@owlmeans/server-context'

const serverContext = makeServerContext(
  config(AppType.Backend, 'my-service', { port: 3000 })
)
```

## API

### `makeServerContext<C, T>(cfg): T`

Creates a server context with:
- File-based config reader middleware (reads `CONFIG_DIR` / `config.json`)
- `PLUGINS` config resource
- Trusted key management resource
- Ed25519 guard service registration

### `config<C>(type, service, cfg?): C`

Creates a `ServerConfig`. Alias re-exported from `@owlmeans/server-app`.

### `ServerConfig`

Extends `CommonConfig` with `port?: number`, `security?: ServerSecurityConfig`.

### `ServerContext<C>`

Extends `BasicContext<C>` with `getApiServer(): ApiServer`.

## Related Packages

- [`@owlmeans/context`](../context) — `BasicContext` base
- [`@owlmeans/server-app`](../server-app) — higher-level `makeContext` that calls this internally
- [`@owlmeans/server-config`](../server-config) — `sservice()` used to configure services

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
