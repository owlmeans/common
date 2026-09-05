---
name: api-config
description: How to use @owlmeans/api-config — the shared entrypoint declaration and redaction lists behind the runtime config document a backend advertises and a frontend merges into its own config at boot. Auto-invoked when importing api-config, or when wiring runtime API config between a server and a client.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/api-config

**Layer:** Core
**Install:** `"@owlmeans/api-config": "^0.1.18-rc.12"` in `dependencies`

The contract package of a three-package flow: this one declares the endpoint and what may cross it,
`@owlmeans/api-config-server` answers it, `@owlmeans/api-config-client` fetches it and merges the
answer into the client config. Nothing here runs — it is the shared declaration all three agree on.

## Key Exports

| Export | Description |
|--------|-------------|
| `entrypoints` | The single declaration — alias `API_CONFIG`, route `/assets/config.json`, `sticky: true` so a router attaches it unconditionally |
| `API_CONFIG` | The alias (`api-config:advertise`) both sides elevate |
| `notAdvertizedConfigKeys` | Config keys the server strips before answering — `dbs`, `trusted`, `ready`, `service`, `type`, `records`, `webService`, `oidc`, `storageBuckets`, `secrets` |
| `allowedConfigRecords` | The only `recordType` values a config record may carry to be advertised — `plan`, `product`, `l10n` |
| `ApiConfig` | The advertised document — `CommonConfig` minus `dbs`, `trusted`, `ready`, `service` and `type` |

## Usage

The declaration is elevated on both sides, so neither imports the other's package — they only share
this one. Add it to the entrypoint list the way any other entrypoint set is added:

```typescript
import { entrypoints as apiConfigEntrypoints } from '@owlmeans/api-config'
export const appEntrypoints = [...apiConfigEntrypoints, ...myEntrypoints]
```

Most apps never do this directly: a backend built on `@owlmeans/server-app` already carries the
server side in its built-in `entrypoints`, and a client panel package already carries the client
side.

## What may cross

The advertised document is the server's own config with the secrets taken out, so anything added to
a backend config is public by default. A new config key holding a credential, a connection string or
an internal address belongs in `notAdvertizedConfigKeys`; a new config-record type is invisible to
clients until it is listed in `allowedConfigRecords`. Both lists live here rather than in the server
so the client's type (`ApiConfig`) and the server's redaction cannot drift apart.

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/config`
