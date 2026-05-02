---
name: config
description: How to use @owlmeans/config — typed configuration object construction, service() registration, AppType enum, security helpers (makeSecurityHelper). Auto-invoked when importing from this package or building a config.ts for a new app.
user-invocable: false
---

# @owlmeans/config

**Layer:** Core
**Install:** `"@owlmeans/config": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `config(options)` | Build a typed config object |
| `service(options, cfg?)` | Register a client-callable service in the config |
| `AppType` | Enum of application types (Backend, Web, Native, etc.) |
| `makeSecurityHelper(context)` | Build URLs, resolve secrets, sign payloads |
| `Config` types | Base config interface — extend in your app |
| Plugins | Pluggable config sources |
| Security types | Trusted entities, secrets, certificate types |

## Subpath Exports

- `./utils` — config helper utilities

## Usage

Build the base config in `config.ts`, then add services and storage:

```typescript
import { AppType, config, service } from '@owlmeans/config'
import { sservice } from '@owlmeans/server-app'
import { AGENT, MANAGER_API } from 'my-common'

const cfg = config({ service: MANAGER_API, type: AppType.Backend, port: 8080 }) as AppConfig

cfg.trusted = []
sservice({ service: AGENT, internalHost: 'kluster:service:agent', internalPort: 8081 }, cfg)
service({ service: MANAGER_API, host: 'manager.example.com' }, cfg)

export default cfg
```

Use `makeSecurityHelper` inside handlers to construct URLs that point at trusted services:

```typescript
import { makeSecurityHelper } from '@owlmeans/config'
const helper = makeSecurityHelper<Config, Context>(ctx)
const url = helper.makeUrl(VIB_ALIAS, '/checkout/success')
```

## Depends On

- `@owlmeans/auth` — trusted entity / signing primitives
- `@owlmeans/context` — for the security helper to resolve services
