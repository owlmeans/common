---
name: api-config-server
description: How to use @owlmeans/api-config-server — the backend half of the runtime config flow, which answers the api-config endpoint from package-owned allowlist plugins. Auto-invoked when serving API config from a server app or deciding what a backend advertises to its clients.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/api-config-server

**Layer:** Server
**Install:** `"@owlmeans/api-config-server": "^0.1.18-rc.20"` in `dependencies`

Answers the declaration shared by `@owlmeans/api-config`; the browser side that consumes it is
`@owlmeans/api-config-client`.

## Key Exports

| Export | Description |
|--------|-------------|
| `entrypoints` | The `API_CONFIG` protocol bound to the advertise handler, ready to spread into the app's entrypoint list |

## Usage

```typescript
import { entrypoints as apiConfigEntrypoints } from '@owlmeans/api-config-server'
export const appEntrypoints = [...apiConfigEntrypoints, ...myEntrypoints]
```

An app built on `@owlmeans/server-app` already has it: the `entrypoints` that package exports
include this one, so spreading those is enough and adding this list again is redundant.

## What is advertised

The handler calls `advertisedConfig(ctx.cfg)`. It copies nothing generically: only import-time
`apiConfigPlugin()` registrations from `@owlmeans/api-config` and packages the application loaded
can contribute fields.

- Base registration keeps public service routes, branding, login settings, selected debug flags and frontend plugins. An `sservice()` route with only `internalHost`/`internalPort` is omitted rather than re-exposed through its derived `host`/`port`.
- `@owlmeans/oidc` admits only browser OIDC fields and drops internal providers and credentials.
- `@owlmeans/flow`, `@owlmeans/i18n` and `@owlmeans/payment` register their own client settings and record types.
- SMTP, queues, databases, storage, trusted keys, secrets and all unregistered config fields are absent.

The endpoint carries no guard — it is fetched before the client has any credential — so nothing
that requires authorization to read belongs in a plugin's `allow` selection.

The endpoint carries no guard — it is fetched before the client has any credential — so nothing
that requires authorization to read belongs in the answer.

## Depends On

Declared: `@owlmeans/api-config`, `@owlmeans/server-api`, `@owlmeans/server-entrypoint`,
`@owlmeans/server-context`.

Imported but **not** declared in this package's manifest: `@owlmeans/config` (`PLUGINS`, the plugin
config type) and `@owlmeans/context` (`AppType`, the config-record key). A workspace resolves them
anyway; a standalone install has to name them in its own dependencies.
