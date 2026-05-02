# @owlmeans/config

Configuration builder utilities for OwlMeans applications.

## Overview

- `makeConfig` / `config` — create a typed application config object
- `service` — attach a service route record to a config
- `makeSecurityHelper` — URL builder that respects `secure`/`unsecure` config flags
- Re-exports `AppType` from `@owlmeans/context` for convenience

## Installation

```bash
bun add @owlmeans/config
```

## Usage

Build an app config with services (typically done via `@owlmeans/server-app`'s re-exported `config`):

```typescript
import { config, service, AppType } from '@owlmeans/server-app'
// or directly:
import { makeConfig, service } from '@owlmeans/config'
import { AppType, Layer } from '@owlmeans/context'

const appConfig = config(
  AppType.Backend,
  'manager-api',
  service({ service: 'mongo', host: 'localhost', port: 27017 }),
  { layer: Layer.Service, port: 3000 }
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
  service({ service: 'mongo', host: 'db', port: 27017 }),
  service({ service: 'redis', host: 'cache', port: 6379 })
)
```

### `makeSecurityHelper(ctx): SecurityHelper`

Creates a URL builder that handles protocol selection (http/https/ws/wss) based on the app's `security.unsecure` flag.

### `toConfigRecord(...items): ConfigRecord[]`

Converts service config objects to `ConfigRecord[]` for context-managed configuration.

## Related Packages

- [`@owlmeans/context`](../context) — `BasicConfig`, `AppType`, `Layer`
- [`@owlmeans/route`](../route) — `CommonServiceRoute` used by the `service()` helper
- [`@owlmeans/server-app`](../server-app) — re-exports `config`, `service`, `sservice`
