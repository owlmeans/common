# @owlmeans/api-config-server

The backend half of the runtime config flow: one server binding that answers the shared `advertise`
protocol of `@owlmeans/api-config` at `GET /assets/config.json` with the public subset of the
server's config. A server app uses it so its browser clients can read service routes, branding,
login settings and frontend plugins at startup instead of baking them into the bundle. An app built
on `@owlmeans/server-app` already receives it through that package's `entrypoints` and never
imports it directly. It does not decide **what** is public — packages register that with
`apiConfigPlugin()` in `@owlmeans/api-config` — and it does not fetch anything; the browser side is
`@owlmeans/api-config-client`.

## Installation

```bash
bun add @owlmeans/api-config-server@^0.1.18-rc.52
```

## Concepts

- **Advertise protocol** — `advertise` from `@owlmeans/api-config`, an open (unguarded) protocol on
  route `API_CONFIG` (`'api-config:advertise'`), path `/assets/config.json`. This package only binds
  it on the server.
- **Binding** — `entrypoints` is a local list of `bind(advertise, handler)` results
  (`@owlmeans/server-entrypoint`), spread into the list the app registers; it is not a shared
  declaration tree.
- **Advertised config** — the handler returns `advertisedConfig(ctx.cfg)`: the merge of every
  `apiConfigPlugin()` registration applied to the server config. Nothing is copied generically.
- **Allowlist plugin** — an `ApiConfigPlugin` (`{ allow, deny? }`) registered at module import by a
  package that owns config fields. Only packages the server process actually imports contribute.

## Usage

### Register the binding

With `@owlmeans/server-app`, spread its `entrypoints` — they already contain this list:

```typescript
import { entrypoints as frameworkBindings, main } from '@owlmeans/server-app'

await main(context, [...frameworkBindings, ...appBindings])
```

A server assembled from the lower layers registers the list itself:

```typescript
import { entrypoints as apiConfigBindings } from '@owlmeans/api-config-server'

context.registerEntrypoints([...apiConfigBindings, ...serverBindings])
```

### Make a package field public

The answer is controlled by plugins in `@owlmeans/api-config`, not by this package. A package that
owns client-relevant config registers its fields at import time; `deny` removes nested values even
under an allowed ancestor, and `every(selection, where?)` selects items of a list or map.

```typescript
import { CONFIG_RECORD } from '@owlmeans/context'
import { apiConfigPlugin, every } from '@owlmeans/api-config'

// A whole section, minus its credential
apiConfigPlugin({
  allow: { reports: true },
  deny: { reports: { apiKey: true } },
})

// Only some items of a list (the pattern @owlmeans/payment uses for its config records)
apiConfigPlugin({
  allow: {
    [CONFIG_RECORD]: every(true, value =>
      value != null && typeof value === 'object' && (value as { recordType?: string }).recordType === 'report-plan'
    ),
  },
})
```

`selectApiConfig(config, plugin)` from `@owlmeans/api-config` applies one plugin without registering
it, which is how a package tests its contract.

## API

| Export | Kind | Purpose |
|---|---|---|
| `entrypoints` | `ServerEntrypoint[]` | `[bind(advertise, handler)]` — the server binding of the runtime-config endpoint |

The handler is built with `handlers<ServerContext<ServerConfig>>().request(...)` from
`@owlmeans/server-api` and returns `advertisedConfig(context.cfg)`.

## What is advertised

- The base registration in `@owlmeans/api-config` keeps `debug` flags (`all`, `i18n`, `supervisor`),
  `brand`, `security.unsecure`, `security.auth` (`flow`, `enter`, `login`), public `services`
  entries (`service`, `type`, `host`, `port`, `base`, `home`, `default`) and frontend `PLUGINS`.
- An `sservice()` route that has only `internalHost`/`internalPort` is omitted rather than exposed
  through its derived `host`/`port`.
- `@owlmeans/oidc`, `@owlmeans/flow`, `@owlmeans/i18n` and `@owlmeans/payment` register their own
  client settings and record types.
- SMTP, queues, databases, storage, trusted keys, secrets and every unregistered field are absent.

The `api-config-server` skill keeps this list current.

## Common pitfalls

- The endpoint carries no guard — it is fetched before the client has a credential — so nothing
  that requires authorization to read belongs in a plugin's `allow` selection.
- Adding `apiConfigBindings` next to `@owlmeans/server-app`'s `entrypoints` is redundant — the
  second registration only replaces the first under the same alias.
- A plugin registers only when its module is imported in the server process; a field the server
  never imports the owning package for is not advertised.
- The package imports `@owlmeans/config` and `@owlmeans/context` without declaring them; a
  standalone install must list them in its own dependencies.

## Related packages

- [`@owlmeans/api-config`](../api-config) — the `advertise` protocol, `API_CONFIG`, `apiConfigPlugin`, `every`, `advertisedConfig`
- [`@owlmeans/api-config-client`](../api-config-client) — client middleware that fetches this endpoint and merges it into the client config
- [`@owlmeans/server-app`](../server-app) — server layer whose `entrypoints` already include this binding
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — `bind()` and the server entrypoint type
- [`@owlmeans/server-api`](../server-api) — `handlers()` used to build the request handler

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.51
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
