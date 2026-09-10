---
name: context
description: How to use @owlmeans/context — the DI container behind every OwlMeans app, its service/resource/entrypoint registries, the configure/init lifecycle, createService and createLazyService, middlewares, and the shared route-alias constants. Auto-invoked when importing context primitives, registering a service, or building a makeContext factory.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/context

**Layer:** Core
**Install:** `"@owlmeans/context": "^0.1.18-rc.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeBasicContext(cfg)` | Low-level factory — extend a layer-specific factory instead |
| `BasicContext<C>` | The container interface, typed by its config |
| `BasicConfig` | `{ ready, service, alias?, type, services?, records?, debug? }` — what every config extends |
| `makeBasicConfig(type, service, cfg?)` | Build the base config object a layer factory then fills in |
| `createService(alias, impl, init?)` | Build a service initialized during `context.init()` |
| `createLazyService(alias, impl, init?)` | Build a service initialized on first `context.service()` |
| `appendContextual(alias, obj)` | Give any object `alias` / `registerContext` / `assertCtx` |
| `assertContext(ctx, location?)` | Return the context or throw `SyntaxError` when it is absent |
| `Service` / `InitializedService` / `LazyService` | The three service shapes |
| `BasicResource` / `BasicEntrypoint` / `Contextual` | The other registrable shapes |
| `Middleware`, `MiddlewareType`, `MiddlewareStage` | Hooks that run inside `configure()` / `init()` |
| `AppType` | `Backend` / `Frontend` |
| `ContextStage` | `Configuration` → `Loading` → `Ready` |
| `CONFIG_RECORD` (`'records'`), `ConfigRecord` | The config-record array key, and a record in it |
| `ROOT`, `HOME`, `GUEST`, `BASE`, `CRASH` | Route-alias idioms every layer reuses |

## One context per process

A context is created ONCE by ONE factory. Extend a layer-specific factory
(`@owlmeans/server-context`, `@owlmeans/web-panel`, …) rather than calling the basic factory
directly: your factory calls the factory below it, applies its own idempotent `append*(context)`
mixins and service registrations, and returns that same context. There are no layered or child
contexts and nothing is stored for re-creation — a service, a resource and an entrypoint each bind
to exactly one context, the first that registers them.

```typescript
import { makeServerContext } from '@owlmeans/server-context'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeServerContext<C, T>(cfg)
  context.registerService(makeMyService())
  return context
}
```

## Registries

Three flat maps keyed by alias. Registering the same alias twice **replaces** the earlier entry —
entrypoint lists are routinely spread together and the later declaration is the one the app means.

```typescript
context.registerService(service)            // service(alias), hasService(alias)
context.registerResource(resource)          // resource(alias), hasResource(alias)
context.registerEntrypoints(entrypoints)    // entrypoint(alias), entrypoints(), hasEntrypoint(alias)
```

Every lookup throws `SyntaxError` when the alias is unknown. Resolve a service and call another
service's entrypoint from a handler:

```typescript
const someService = ctx.service<MyService>(MY_SERVICE_ALIAS)

const response = await ctx.entrypoint<ClientEntrypoint<ResponseType>>(
  externalService.action.alias
).call({ body: { ... } })   // call() resolves to the value; invoke() gives { value, outcome }
```

## Lifecycle

`configure()` runs the `Config` + `Configuration` middlewares and moves the context to `Loading`;
`init()` awaits that, then initializes every service, then the resources, then flips to `Ready` and
sets `cfg.ready`. `waitForConfigured()` and `waitForInitialized()` resolve at those two points, and
`await ctx.config` yields the config once configuration is done. Both calls are safe to repeat — a
context already past the stage returns itself unchanged.

`configure()` is **not** async: it returns the context straight away and its middlewares run
detached, so the stage flips to `Loading` only when they settle. Anything that must see a configured
context awaits `waitForConfigured()` or `init()`, never the return of `configure()`.

## Services

`createService` and `createLazyService` differ only in **when** the init function runs.

- `createService` — `init()` is awaited during `context.init()`, in registration order. Asking for
  an uninitialized one throws `SyntaxError`.
- `createLazyService` — `lazyInit()` fires on the first `context.service(alias)` and the service is
  returned immediately, before that promise settles. Choose lazy when the service must be reachable
  while the context is still `Loading` — from an app's `makeContext`, or from another package's
  `append*` helper — **not** because it has no async work; most lazy services do plenty of it.

```typescript
import { createService } from '@owlmeans/context'

export const makeMyService = (alias = MY_SERVICE) => createService<MyService>(alias, {
  doWork: async () => { /* ... */ }
}, service => async () => {
  await connect()
  service.initialized = true
})
```

The init function is a factory: it receives the service and returns the actual initializer, which
must set `service.initialized = true`. Omit it and the service is simply marked initialized. Inside
any method use `service.assertCtx<Config, Context>()` to reach the context it was registered on.

### `ready()`

Both factories give the service a `ready(): Promise<boolean>` that resolves once its init function
has finished, and both `InitializedService` and `LazyService` declare it. It is how you wait for a
lazy service: the container hands the service back before `lazyInit()` settles, so anything the init
prepared — a database client, a loaded config, a socket — is only safe to touch after `ready()`.

```typescript
const mongo = ctx.service<MongoService>(MONGO_ALIAS)   // this call is what triggers lazyInit
await mongo.ready()
```

A lazy service's init runs only when someone resolves it through `context.service(alias)`, so
`ready()` on a reference obtained any other way never settles.

## Middlewares

A middleware declares a `type` (`Config` or `Context`) and a `stage` (`Configuration`, `Loading` or
`Ready`), and that pair — not the stage alone — decides where it runs. Exactly five pairs are ever
applied, in this order:

| Type + stage | Where it runs |
|--------------|---------------|
| `Config` + `Configuration` | inside `configure()`, before the stage becomes `Loading` — the only hook that sees `cfg` before anything else does |
| `Context` + `Configuration` | first thing inside `init()` |
| `Config` + `Loading` | inside `init()`, **after every service has been initialized** and before the resources |
| `Context` + `Loading` | inside `init()`, after the resources |
| `Context` + `Ready` | after the stage flips to `Ready`; started but **not awaited**, so `init()` resolves without waiting for it |

`Config` + `Ready` is never applied at all — a middleware registered under that pair silently never
runs. All middlewares sharing a pair are applied with `Promise.all`, so they run concurrently and
registration order does not sequence them.

Pick the pair by what the work needs. `Config` + `Configuration` is for config that stands on its
own — mounted secrets, hosts read from the environment. `Config` + `Loading` is for config that has
to be resolved *through a running service*, because services are already initialized by then; that
is the stage a cluster- or vault-backed value resolver registers at, and it can `await
service.ready()` on the service it depends on. `Context` middlewares register or adjust what the
container holds.

```typescript
context.registerMiddleware({
  type: MiddlewareType.Config,
  stage: MiddlewareStage.Loading,   // services are up — resolve cfg values through one of them
  apply: async ctx => { /* mutate ctx.cfg */ }
})
```

## Depends On

- Nothing. This is the root package — `@owlmeans/config` layers the application config on top of
  `BasicConfig`, and `@owlmeans/entrypoint` layers URL units on top of `BasicEntrypoint`.
