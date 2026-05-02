---
description: "How to use @owlmeans/config — typed configuration object construction, service() registration, AppType enum, security helpers. Use when building a config.ts for a new app."
applyTo: "**/config.ts, **/config.tsx, **/*.ts, **/*.tsx"
---

# @owlmeans/config

**Layer:** Core
**Install:** `"@owlmeans/config": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `config(options)` | Build a typed config object |
| `service(options, cfg?)` | Register a client-callable service in the config |
| `AppType` | Enum of application types |
| `makeSecurityHelper(context)` | Build URLs, resolve secrets, sign payloads |
| `Config` types | Base config interface — extend in your app |
| Plugins | Pluggable config sources |
| Security types | Trusted entities, secrets, certificate types |

## Subpath Exports

- `./utils` — config helper utilities

## Usage

```typescript
import { AppType, config, service } from '@owlmeans/config'
import { sservice } from '@owlmeans/server-app'

const cfg = config({ service: MANAGER_API, type: AppType.Backend, port: 8080 }) as AppConfig
cfg.trusted = []
sservice({ service: AGENT, internalHost: 'kluster:service:agent', internalPort: 8081 }, cfg)
```

## Depends On

- `@owlmeans/auth` — trusted entity / signing primitives
- `@owlmeans/context` — for the security helper
