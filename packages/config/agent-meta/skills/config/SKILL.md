---
name: config
description: How to use @owlmeans/config — the application config every OwlMeans layer extends, service() declarations, plugin records, the config resource, brand and login-screen settings, and makeSecurityHelper for building URLs. Auto-invoked when importing from this package or writing a config.ts for a new app.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/config

**Layer:** Core
**Install:** `"@owlmeans/config": "^0.1.18-rc.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeConfig(type, service, cfg?)` | Build a `CommonConfig` — layer packages wrap it as their own `config()` |
| `service(route, cfg?)` | Declare a service the app talks to; writes into `cfg.services[route.service]` |
| `CommonConfig` | The base application config — extend it in your app's `types.ts` |
| `BrandSettings` | `{ name, organization, entity, home }` — what a UI credits the product as |
| `SecurityConfig` / `AuthSecurityConfig` | `cfg.security`, including the sign-in screen settings |
| `LoginScreenConfig`, `LoginMethodConfig`, `LoginTermsConfig`, `LoginCreditConfig` | The login-screen contract |
| `makeSecurityHelper(ctx)` | Build the `SecurityHelper` — `{ makeUrl, url }` |
| `SecurityHelper` | `makeUrl(route, path?, params?)` and `url(path?, params?)` |
| `SecurityHelperUrlParams` | `{ path?, forceUnsecure?, protocol?, host?, base? }` — per-call overrides for either method |
| `plugin(cfg, record, id?)` / `clientPlugin(cfg, record, id?)` | Append a backend / frontend plugin record |
| `PluginConfig` | A plugin record: `{ id, type, value }` |
| `mergeConfig(target, source)` | Deep-merge one config into another (arrays concatenate) |
| `createConfigResource(alias?, key?)` / `appendConfigResource(ctx, alias?, key?)` | Read `cfg` records as a resource |
| `ConfigResource`, `ConfigResourceAppend` | The resource type and the `getConfigResource()` mixin |
| `toConfigRecord` / `fromConfigRecord` | Cast between a plain object and a `ConfigRecord` |
| `ConfigError`, `ConfigResourceError`, `PluginMissconfigured` | Registered `ResilientError` subclasses |
| `AppType` | Re-exported from `@owlmeans/context` so an app imports one package |
| `DEFAULT_ALIAS` (`'config'`), `TRUSTED`, `PLUGINS`, `PLUGIN_RECORD` | Resource and record-key aliases |
| `OWLMEANS_TERMS_URL`, `OWLMEANS_PRIVACY_URL`, `OWLMEANS_COOKIES_URL` | The legal documents an app stands on until its operator supplies its own |

## Subpath Exports

- `./utils` — `visitConfigLeafs(tree, reader)` plus the `Tree` / `TreeKey` / `TreeValue` types it
  walks. It descends a config object and, for every **string** leaf, awaits `reader(value)` and
  writes the answer back. Two limits matter: it replaces a leaf **only when that property's
  descriptor is `writable`**, so a getter or a frozen field is skipped without a word; and it
  rewrites strings only, never numbers, booleans or the objects it recurses through.

  It is the walker a package uses to resolve its own directive syntax across a whole config —
  `@owlmeans/kluster` resolves its `kluster:<directive>:<query>` lookups this way, from a
  `Config` + `Loading` middleware, once the service that answers them is up. It is **not** the
  path-to-file-contents mechanism: that is `readConfigValue` in `@owlmeans/server-config`, which
  `@owlmeans/server-context` drives over the config at boot.

## Usage

An application does not call `makeConfig` directly — it calls its layer's `config()`
(`@owlmeans/server-context`, `@owlmeans/client-context`, or the app package that re-exports it) and
then declares the services it talks to. `service()` takes the service route itself, so the same call
shape describes a frontend host and a backend API:

```typescript
import { AppType, service } from '@owlmeans/config'
import { config, sservice } from '@owlmeans/server-app'
import { API, WEB, WORKER } from 'my-common'

const cfg = config<AppConfig>(API)

cfg.trusted = []
service({ type: AppType.Frontend, service: WEB, host: 'app.example.com' }, cfg)
service({ type: AppType.Backend, service: API, host: 'api.example.com', base: 'api' }, cfg)
// internalHost/internalPort — reachable only from inside the cluster, and never over TLS
sservice({ service: WORKER, internalHost: 'worker', internalPort: 8081 }, cfg)

cfg.brand = { name: 'My Product', organization: 'My Company' }

export default cfg
```

A service entry with a `host` is what route resolution needs; one carrying only `internalHost` is
reachable from a backend but cannot be linked to. `default: true` marks the entry that answers for
its `AppType` when a route names no service.

## Security helper

`makeSecurityHelper` builds URLs and nothing else — it does not read secrets and does not sign.

```typescript
import { makeSecurityHelper } from '@owlmeans/config'

const helper = makeSecurityHelper<Config, Context>(ctx)
helper.makeUrl(ctx.cfg.services[WEB], '/checkout/success')  // service entry, declaration or address
helper.url('/health')                                        // this service's own host
helper.url('/health', { forceUnsecure: true })                // per-call override
helper.makeUrl(ctx.cfg.services[WEB], { path: '/webhook', base: true })  // params in place of path
```

`makeUrl`'s first argument is anything that names where a route answers: an entrypoint's
`RouteAddress` (host already picked), a bare `RouteDeclaration`, or a service entry. Without a host
it falls back to the service named in `cfg.services`, and throws `SyntaxError` when neither yields
one.

Both methods take a trailing `SecurityHelperUrlParams` — `{ path, forceUnsecure, protocol, host,
base }`. Only `makeUrl` declares that object **in place of** the path argument
(`path?: string | SecurityHelperUrlParams`), reading `path` out of it; `url` is typed
`(path?: string, params?)`, so the same shorthand there does not type-check — pass the path first.

`base` on `makeUrl` is three-valued: a string replaces the base, `true` drops it, `false` keeps the
one the route or service declares. `url()` ignores a boolean `base`, and a string one reaches the URL
**only when the call also passes `host`**: without a host it resolves this service's entry from
`cfg.services` and takes that entry's `base`, overwriting what was passed — so with a service based
at `srv`, `url('/health', { base: 'other' })` yields `https://<host>/srv/health`.

Scheme selection, in the order it is decided:

- the route's own `secure` (default `true`) proposes TLS;
- `cfg.security.unsecure === true`, or `forceUnsecure` on the call, drops it to plain;
- `cfg.security.unsecure === false` forces TLS back on, overriding both;
- a fully qualified `host` (one containing `://`) picks the protocol **family** from its scheme —
  anything starting `http` becomes `RouteProtocols.WEB`, anything starting `ws` becomes
  `RouteProtocols.SOCKET` — and the host is reduced to the authority. It does not decide TLS; the
  `s` is still appended from the steps above.

On the client prefer `context.entrypoint<ClientEntrypoint<string>>(alias).url()`, which delegates
here — see `@owlmeans/client-entrypoint`.

## Config records as a resource

`appendConfigResource(ctx)` registers a read-only resource over the array under `cfg.records` (or
any other key) and adds `getConfigResource()` to the context. Every read is a query over what is
already in memory; every write throws `UnsupportedMethodError`, because configuration is what the
process was started with, not something it edits at runtime.

```typescript
const { items } = await ctx.getConfigResource().list({ recordType: MY_RECORD_TYPE })
const one = fromConfigRecord<ConfigRecord, MyRecord>(await ctx.getConfigResource().get(id))
```

## Depends On

- `@owlmeans/context` — `BasicConfig`, `AppType`, and the context the security helper reads
- `@owlmeans/route` — service routes and the protocol/path primitives URLs are built from
- `@owlmeans/resource` — the resource contract the config resource implements
- `@owlmeans/auth` — `Profile`, the shape of `cfg.trusted`
- `@owlmeans/error` — `ResilientError`, which the config errors extend
