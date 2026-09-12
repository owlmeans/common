---
name: api-config
description: How to use @owlmeans/api-config — the shared entrypoint declaration and import-time allowlist plugins behind the runtime config document a backend advertises and a frontend merges into its own config at boot. Auto-invoked when importing api-config, or when wiring runtime API config between a server and a client.
user-invocable: false
---

# @owlmeans/api-config

**Layer:** Core
**Install:** `"@owlmeans/api-config": "^0.1.18-rc.15"` in `dependencies`

The contract package of a three-package flow: this one declares the endpoint and what may cross it,
`@owlmeans/api-config-server` answers it, `@owlmeans/api-config-client` fetches it and merges the
answer into the client config. Nothing here runs — it is the shared declaration all three agree on.

## Key Exports

| Export | Description |
|--------|-------------|
| `entrypoints` | The single declaration — alias `API_CONFIG`, route `/assets/config.json`, `sticky: true` so a router attaches it unconditionally |
| `apiConfigEntrypoints.config` | The shared `api-config:advertise` protocol both sides bind |
| `apiConfigPlugin(plugin)` | Registers one package's public config selection as its module loads |
| `every(selection, where?)` | Applies a selection to every list item or object-map value, optionally filtering items |
| `ApiConfigPlugin` | `{ allow, deny? }` — nested allowlist with an optional nested redaction selector |
| `advertisedConfig(cfg)` | Applies every imported package contract to build the endpoint document |
| `ApiConfig` | The partial public document a client merges into its local config |

## Usage

The declaration is bound on both sides, so neither imports the other's package — they only share
this one. Add it to the entrypoint list the way any other entrypoint set is added:

```typescript
import { entrypoints as apiConfigEntrypoints } from '@owlmeans/api-config'
export const appEntrypoints = [...apiConfigEntrypoints, ...myEntrypoints]
```

Most apps never do this directly: a backend built on `@owlmeans/server-app` already carries the
server side in its built-in `entrypoints`, and a client panel package already carries the client
side.

## What may cross

The document is default-deny: a server config value is absent until the package that owns its
browser consumer registers a precise `allow` selector during import. Do not allow an ancestor with
`true` unless every descendant is public; name fields instead, and use `deny` when an otherwise
public collection carries nested credentials.

```typescript
import { apiConfigPlugin, every } from '@owlmeans/api-config'

apiConfigPlugin({
  allow: { oidc: { providers: every(true) } },
  deny: { oidc: { providers: every({ secret: true, apiClientId: true }) } },
})
```

The base contract supplies public routes, branding, login settings, selected debug flags and
frontend plugins. `@owlmeans/oidc`, `@owlmeans/flow`, `@owlmeans/i18n` and `@owlmeans/payment`
register their own client settings during import. Databases, queues, SMTP, secrets and every
unregistered config extension never cross the unauthenticated endpoint.

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/config`
