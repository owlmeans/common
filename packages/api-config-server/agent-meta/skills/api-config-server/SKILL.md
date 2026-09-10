---
name: api-config-server
description: How to use @owlmeans/api-config-server — the backend half of the runtime config flow, which answers the api-config endpoint with a redacted copy of the server config. Auto-invoked when serving API config from a server app or deciding what a backend advertises to its clients.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/api-config-server

**Layer:** Server
**Install:** `"@owlmeans/api-config-server": "^0.1.18-rc.17"` in `dependencies`

Answers the declaration shared by `@owlmeans/api-config`; the browser side that consumes it is
`@owlmeans/api-config-client`.

## Key Exports

| Export | Description |
|--------|-------------|
| `entrypoints` | The `API_CONFIG` declaration elevated with the advertise handler, ready to spread into the app's entrypoint list |

## Usage

```typescript
import { entrypoints as apiConfigEntrypoints } from '@owlmeans/api-config-server'
export const appEntrypoints = [...apiConfigEntrypoints, ...myEntrypoints]
```

An app built on `@owlmeans/server-app` already has it: the `entrypoints` that package exports
include this one, so spreading those is enough and adding this list again is redundant.

## What is advertised

The handler answers with the server's own config, minus everything the shared redaction lists name:

- `debug` is always present (`{}` when the server sets none).
- `services` is reduced to `service`, `type`, `host`, `port` and `base` per entry. `internalHost`
  and `internalPort` are dropped as **keys**, which is not the same as keeping the address private:
  `sservice` mirrors them into `host` / `port` whenever those are unset, so a service declared with
  the cluster address only advertises the cluster address under a different name. A peer whose
  address must not be public needs its own public `host` / `port`.
- `plugins` keeps only the entries whose `type` is `AppType.Frontend`.
- Config records (`records`) keep only those whose `recordType` is in `allowedConfigRecords`.
- `oidc`, when configured, is rebuilt rather than copied: `clientCookie` plus the providers with
  `secret` and `apiClientId` stripped, and providers marked `internal` dropped entirely.
- Every remaining config key is copied verbatim, except `debug`, `services`, `plugins` and the keys
  in `notAdvertizedConfigKeys` (`dbs`, `trusted`, `ready`, `service`, `type`, `records`,
  `webService`, `oidc`, `storageBuckets`, `secrets`). The answer is assembled in three layers — the
  seeded keys above, then that verbatim copy, then the conditional `oidc` rebuild — so the verbatim
  copy overwrites whichever seeded key it also carries. `brand` is on neither exclusion list, so it
  is carried, and the server's own brand settings are what the client receives; the `{}` the handler
  seeds survives only for a server that declares no brand at all.

The consequence is the rule to work by: **a backend config key is public unless a list says
otherwise.** Adding a credential, a connection string or an internal address to the config means
adding its key to `notAdvertizedConfigKeys` in `@owlmeans/api-config` in the same change; adding a
config-record type means listing it in `allowedConfigRecords` before a client can see it.

The endpoint carries no guard — it is fetched before the client has any credential — so nothing
that requires authorization to read belongs in the answer.

## Depends On

Declared: `@owlmeans/api-config`, `@owlmeans/server-api`, `@owlmeans/server-entrypoint`,
`@owlmeans/server-context`.

Imported but **not** declared in this package's manifest: `@owlmeans/config` (`PLUGINS`, the plugin
config type) and `@owlmeans/context` (`AppType`, the config-record key). A workspace resolves them
anyway; a standalone install has to name them in its own dependencies.
