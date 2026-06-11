---
description: "How to use @owlmeans/config — typed configuration object construction, service() registration, AppType enum, security helpers. Use when building a config.ts for a new app."
applyTo: "**/config.ts, **/config.tsx, **/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/config

**Layer:** Core
**Install:** `"@owlmeans/config": "^0.1.7"` in `dependencies`

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

## makeSecurityHelper — URL Generation

`makeSecurityHelper(ctx)` returns a `SecurityHelper` with `makeUrl(route, path?, params?)` that builds full URLs respecting service host/port/base and the `security.unsecure` flag:

```typescript
import { makeSecurityHelper } from '@owlmeans/config'

const helper = makeSecurityHelper(ctx)
// Build URL for a specific service route
const url = helper.makeUrl(module.route.route, '/callback', { host, base })
// => "https://api.example.com/callback"
```

On the client side, prefer calling `context.entrypoint<ClientEntrypoint<string>>(alias).call({ full: true })` which internally uses `makeSecurityHelper` — see `@owlmeans/client-entrypoint` instructions.

## Depends On

- `@owlmeans/auth` — trusted entity / signing primitives
- `@owlmeans/context` — for the security helper
