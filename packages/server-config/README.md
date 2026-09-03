# @owlmeans/server-config

Server-specific configuration utilities: `sservice()` helper and config-file reader.

## Overview

- `sservice()` adds a named service route to a server config (analogous to `service()` from `@owlmeans/config`, but for `BasicServerConfig`)
- `readConfigValue()` reads a config value from a JSON file or falls back to an environment variable
- Re-exported via `@owlmeans/server-app` as `sservice`

## Installation

```bash
bun add @owlmeans/server-config@^0.1.18-rc.11
```

## Usage

Add a service endpoint to a backend config (via `@owlmeans/server-app`):

```typescript
import { config, sservice, AppType } from '@owlmeans/server-app'

const appConfig = config(
  AppType.Backend,
  'manager-api',
  sservice({ service: 'auth', host: 'auth-service', port: 3001 })
)
```

Read a secret from file or environment:

```typescript
import { readConfigValue } from '@owlmeans/server-config'

const dbPassword = await readConfigValue('DB_PASSWORD', '/run/secrets/db_password')
```

## API

### `sservice<C>(route, cfg?): Partial<C>`

Adds a service route to a `BasicServerConfig`. The `service` field of `route` becomes the service alias.

### `readConfigValue(envVar, filePath?): Promise<string>`

Returns the value of `envVar` from the environment. If `filePath` is provided and the file exists, reads from there instead (useful for Docker secrets).

### `BasicServerConfig`

Extends `CommonConfig` with:
- `port?: number`
- `security?: { unsecure?: boolean }`

## Related Packages

- [`@owlmeans/config`](../config) — `service()` for client-accessible services; `makeConfig` base factory
- [`@owlmeans/server-app`](../server-app) — re-exports `sservice`

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
