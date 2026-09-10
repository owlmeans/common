# @owlmeans/config

Configuration builder utilities for OwlMeans applications.

## Overview

- `makeConfig` / `config` — create a typed application config object
- `service` — attach a service route record to a config
- `makeSecurityHelper` — URL builder that respects `secure`/`unsecure` config flags
- Re-exports `AppType` from `@owlmeans/context` for convenience

## Installation

```bash
bun add @owlmeans/config@^0.1.18-rc.11
```

## Usage

Build an app config with services (typically done via `@owlmeans/server-app`'s re-exported `config`):

```typescript
import { config, service, AppType } from '@owlmeans/server-app'
// or directly:
import { makeConfig, service } from '@owlmeans/config'
import { AppType } from '@owlmeans/context'

const appConfig = config(
  AppType.Backend,
  'manager-api',
  service({ service: 'manager-api', host: 'localhost', port: 3000 }),
  { port: 3000 }
)
```

Build a URL from a route using the security helper:

```typescript
import { makeSecurityHelper } from '@owlmeans/config'

const security = makeSecurityHelper(context)
const url = security.makeUrl(route, '/path', { id: '123' })
```

## API

### `makeConfig<C>(type, service, cfg?): C`

Creates a basic app config. `config` is an alias exported from `@owlmeans/server-app`.

### `service(route, cfg?): Partial<C>`

Returns a partial config that adds a service route. Chain multiple `service()` calls or spread them:

```typescript
config(AppType.Backend, 'myapp',
  service({ service: 'manager-api', host: 'api', port: 3000 }),
  service({ service: 'manager-web', host: 'web', port: 8080 })
)
```

### `makeSecurityHelper(ctx): SecurityHelper`

Creates a URL builder that handles protocol selection (http/https/ws/wss) based on the app's `security.unsecure` flag.

### `toConfigRecord(object): ConfigRecord`

Casts a plain config object into a `ConfigRecord` for context-managed configuration. `fromConfigRecord` is the inverse.

## Related Packages

- [`@owlmeans/context`](../context) — `BasicConfig`, `AppType`
- [`@owlmeans/route`](../route) — `CommonServiceRoute` used by the `service()` helper
- [`@owlmeans/server-app`](../server-app) — re-exports `config`, `service`, `sservice`

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
