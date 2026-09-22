# @owlmeans/config

The application config every OwlMeans layer extends: the `CommonConfig` shape, `service()`
declarations for the hosts an app talks to, plugin records, brand and sign-in screen settings, a
read-only resource over config records, and `makeSecurityHelper` for building absolute URLs. An app
uses it in its shared `config.ts` and wherever it types or reads configuration. It does not build
the config for a process: call your layer's `config()` (`@owlmeans/server-context` /
`@owlmeans/server-app` on a backend, `@owlmeans/client-context` or the web context on a frontend).
Resolving file paths into secret values at boot is `@owlmeans/server-config`, and backend-only
services are declared with `sservice()` from the same package.

## Installation

```bash
bun add @owlmeans/config@^0.1.18-rc.32
```

## Concepts

- **`CommonConfig`** — the base config (`BasicConfig` from `@owlmeans/context` plus `trusted`,
  `records`, `plugins`, `dbs`, `security`, `brand`). Every app extends it in its own `types.ts`.
- **Service entry** — a `CommonServiceRoute` stored under `cfg.services[service]`: where a named
  service answers (`host`, `port`, `base`, `internalHost`, `internalPort`, `home`, `default`).
- **Config record** — an item with an `id` in an array on the config (`cfg.records`, `cfg.trusted`,
  `cfg.plugins`), readable at runtime through a config resource.
- **Plugin record** — a `PluginConfig` (`{ id, type, value, ... }`) under `cfg.plugins`; how a
  package stores its own settings (a payment gateway, a DNS provider) without widening the config type.
- **Security helper** — `{ makeUrl, url }`, which turns a route, service entry or address into an
  absolute URL, choosing `http`/`https`/`ws`/`wss` from the route and `cfg.security.unsecure`.
- **Brand and login screen** — `cfg.brand` names the product and organization a UI credits;
  `cfg.security.auth.login` controls the sign-in chooser, its terms confirmation and its credit line.

## Usage

### Declare the services an app talks to

A shared `config.ts` names every host once; frontends and backends import it and extend it.
`service()` writes into `cfg.services[route.service]` and returns the same object, so the first call
can create the config and later calls append to it.

```ts
import { AppType, service } from '@owlmeans/config'
import { MY_APP_WEB, MY_APP_API, AUTH_API } from './consts.js'

const cfg = service({
  type: AppType.Frontend,
  service: MY_APP_WEB,
  host: '/etc/app-config/web-host',   // a path; server-config reads the value at boot
}, {
  brand: { home: '/etc/app-config/brand-home' },
})

service({ type: AppType.Backend, service: MY_APP_API, host: '/etc/app-config/api-host' }, cfg)
service({ type: AppType.Backend, service: AUTH_API, host: '/etc/app-config/auth-host', base: 'api' }, cfg)

cfg.brand = { ...cfg.brand, name: 'My App', organization: 'My Company' }

export const commonConfig = cfg
```

### Extend it on a backend

The backend's `config.ts` starts from the shared object and adds what only the backend knows.
`sservice()` (from `@owlmeans/server-app`) declares a backend-only service reachable through
`internalHost`/`internalPort`.

```ts
import { AppType, service } from '@owlmeans/config'
import { sservice } from '@owlmeans/server-app'
import { commonConfig, MY_APP_API, WORKER, PREVIEW } from 'my-app-common'
import type { AppConfig } from './types.js'

const cfg = commonConfig as AppConfig

cfg.trusted = []
sservice({ service: WORKER, internalHost: 'worker', internalPort: 8081 }, cfg)
service({ type: AppType.Frontend, service: PREVIEW, host: '/etc/app-config/preview-host' }, cfg)

cfg.services[MY_APP_API].opened = true   // `opened` belongs to the server-route service type

export default cfg
```

A service entry with a `host` is what route resolution needs; one carrying only `internalHost` is
reachable from a backend but cannot be linked to. `default: true` marks the entry that answers for
its `AppType` when a route names no service.

### Configure the sign-in screen and legal documents

```ts
import { OWLMEANS_COOKIES_URL, OWLMEANS_PRIVACY_URL, OWLMEANS_TERMS_URL } from '@owlmeans/config'

cfg.security ??= {}
cfg.security.auth ??= {}
cfg.security.auth.login = {
  // `methods` (an ordered allow-list of registered method ids) is omitted: every offered method shows
  terms: {
    required: true,
    terms: 'https://example.com/legal/terms',
    privacy: OWLMEANS_PRIVACY_URL,
    cookies: OWLMEANS_COOKIES_URL,
  },
  credit: { poweredBy: true, product: 'My App', since: 2024 },
}
```

Until an operator supplies its own documents, `OWLMEANS_TERMS_URL`, `OWLMEANS_PRIVACY_URL` and
`OWLMEANS_COOKIES_URL` are the ones that govern. `secretKey` (the PK supervisor login) defaults to
`cfg.debug.supervisor === true`.

### Store and read a plugin record

A package registers its settings at context-setup time and reads them back through the `plugins`
config resource, which the server and client contexts register for you.

```ts
import type { PluginConfig } from '@owlmeans/config'
import { plugin, PLUGINS } from '@owlmeans/config'

const INVOICE_GATEWAY = '_external:invoice-gateway'

interface InvoiceGatewayConfig extends PluginConfig {
  apiKey: string
  region?: string
}

export const invoiceGateway = (cfg: AppConfig, opts: Omit<InvoiceGatewayConfig, 'id'>) => {
  plugin(cfg, { ...opts }, INVOICE_GATEWAY)   // type defaults to AppType.Backend
}

export const invoiceGatewayConfig = async (ctx: AppContext) =>
  ctx.getConfigResource<InvoiceGatewayConfig>(PLUGINS).get(INVOICE_GATEWAY)
```

`get` throws `UnknownRecordError` when the id is absent; `load` returns `null`. Criteria and
`list`/`count` go through the shared in-memory query engine of `@owlmeans/resource`.

### Build absolute URLs

```ts
import { makeSecurityHelper } from '@owlmeans/config'

const helper = makeSecurityHelper<AppConfig, AppContext>(ctx)

helper.makeUrl(ctx.cfg.services[MY_APP_WEB], '/checkout/success')           // another service
helper.makeUrl(ctx.cfg.services[MY_APP_WEB], { path: '/webhook', base: true }) // params in place of path, base dropped
helper.url('/health')                                                         // this service's own host
helper.url('/health', { forceUnsecure: true })                                // per-call override
```

On the client prefer `context.entrypoint(protocols.x).url()`, which delegates here; keep the route
and its request/response types in the shared protocol declaration.

## API

### Config and services

| Symbol | Kind | Purpose |
|--------|------|---------|
| `makeConfig(type, service, cfg?)` | function | Build a `CommonConfig` (`trusted` and `records` preset); layer packages wrap it as their own `config()` |
| `service(route, cfg?)` | function | Write a `CommonServiceRoute` into `cfg.services[route.service]`; returns the config |
| `mergeConfig(target, source)` | function | Deep-merge `source` into `target` in place; arrays concatenate |
| `toConfigRecord(object)` / `fromConfigRecord(record)` | function | Cast between a plain object and a `ConfigRecord` |
| `AppType` | enum | Re-exported from `@owlmeans/context` |
| `CommonConfig` | type | The base application config |
| `BrandSettings` | type | `{ home?, name?, organization?, entity? }` — what a UI credits |
| `SecurityConfig` / `AuthSecurityConfig` | type | `cfg.security` (`unsecure`, `auth: { flow, enter, login }`) |
| `LoginScreenConfig` | type | Sign-in chooser: `enabled`, `methods`, `overrides`, `secretKey`, `autoSelectSingle`, `terms`, `credit`, `title`, `subtitle` |
| `LoginMethodConfig` / `LoginMethodEmphasis` | type | Per-method settings; `'primary' \| 'secondary' \| 'link'` |
| `LoginTermsConfig` | type | `required`, `terms`, `privacy`, `cookies`, `version` |
| `LoginCreditConfig` | type | `poweredBy`, `product`, `organization`, `entity`, `line`, `copyright`, `holder`, `since` |

### Plugins

| Symbol | Kind | Purpose |
|--------|------|---------|
| `plugin(cfg, record, id?)` | function | Append a plugin record (string becomes `value`; `type` defaults to `Backend`; throws without an id) |
| `clientPlugin(cfg, record, id?)` | function | Same, with `type: AppType.Frontend` |
| `PluginConfig` | type | `ConfigRecord` with `type?` and `value?` |

### Config resource

| Symbol | Kind | Purpose |
|--------|------|---------|
| `createConfigResource(alias?, key?)` | function | Read-only resource over the array at `cfg[key]` (defaults `'config'`, `'records'`) |
| `appendConfigResource(ctx, alias?, key?)` | function | Register that resource and add `getConfigResource()` to the context |
| `ConfigResource` | type | `Resource<ConfigRecord>`; every write method throws `UnsupportedMethodError` |
| `ConfigResourceAppend` | type | `{ getConfigResource<T>(alias?) }` mixin |

### Security helper

| Symbol | Kind | Purpose |
|--------|------|---------|
| `makeSecurityHelper(ctx)` | function | Build a `SecurityHelper` bound to the context config |
| `SecurityHelper` | type | `makeUrl(route, path?, params?)`, `url(path?, params?)` |
| `SecurityHelperUrlParams` | type | `{ path?, forceUnsecure?, protocol?, host?, base? }` |

### Constants and errors

| Symbol | Kind | Purpose |
|--------|------|---------|
| `DEFAULT_ALIAS` | const | `'config'` — default config resource alias |
| `TRUSTED` | const | `'trusted'` — alias and key of the trusted-profiles resource |
| `PLUGINS` / `PLUGIN_RECORD` | const | `'plugins'` — plugin resource alias / config key |
| `OWLMEANS_TERMS_URL`, `OWLMEANS_PRIVACY_URL`, `OWLMEANS_COOKIES_URL` | const | Default legal documents |
| `ConfigError`, `ConfigResourceError`, `PluginMissconfigured` | class | Registered `ResilientError` subclasses |

### `@owlmeans/config/utils`

| Symbol | Kind | Purpose |
|--------|------|---------|
| `visitConfigLeafs(tree, reader)` | function | Walk a config and replace every writable string leaf with `await reader(value)` |
| `Tree`, `TreeKey`, `TreeValue` | type | The shapes the walker descends |

## Common pitfalls

- Do not call `makeConfig` from an app; call the layer's `config()` so the layer's defaults apply.
- `makeUrl` without a host falls back to the named service in `cfg.services` and throws
  `SyntaxError` when neither yields a host.
- `url()` is typed `(path?, params?)`: passing params in place of the path does not type-check,
  and a string `base` only applies when `host` is also passed.
- `cfg.security.unsecure === false` forces TLS on, overriding both the route and `forceUnsecure`.
- The config resource is read-only by design; every write throws `UnsupportedMethodError`.
- `visitConfigLeafs` skips non-writable properties (getters, frozen fields) silently and rewrites
  strings only. It is not the path-to-file-contents mechanism — that is `readConfigValue` in
  `@owlmeans/server-config`.
- `secretKey` follows `cfg.debug.supervisor`, not `debug.all`; keep `supervisor` off in production.

## Related packages

- [`@owlmeans/context`](../context) — `BasicConfig`, `AppType`, `ConfigRecord`
- [`@owlmeans/route`](../route) — `CommonServiceRoute`, `RouteProtocols`, the paths URLs are built from
- [`@owlmeans/resource`](../resource) — the resource contract and query engine the config resource uses
- [`@owlmeans/server-config`](../server-config) — `sservice()` and boot-time value resolution
- [`@owlmeans/server-context`](../server-context) / [`@owlmeans/client-context`](../client-context) — layer `config()` and context wiring
- [`@owlmeans/server-app`](../server-app) — re-exports `config`, `service`, `sservice`, `PLUGINS`
- [`@owlmeans/api-config`](../api-config) — the runtime config a backend advertises and a client merges with `mergeConfig`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.33
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
