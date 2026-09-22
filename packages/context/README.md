# @owlmeans/context

Lightweight dependency injection and service lifecycle for fullstack OwlMeans applications. An app
uses it to author its own services (`createService`, `createLazyService`), to type its context and
config, and to look up services, resources and entrypoints at runtime. An app almost never calls
`makeBasicContext` or `makeBasicConfig` itself — it builds its context with the layer factory
(`makeContext` from `@owlmeans/server-app` or `@owlmeans/web-panel`, `makeClientContext` from
`@owlmeans/client-context`) and its config with `config()` from `@owlmeans/config` or the layer
config package. Protocol declarations live in `@owlmeans/entrypoint`; data access contracts live in
`@owlmeans/resource`.

## Installation

```bash
bun add @owlmeans/context@^0.1.18-rc.28
```

## Concepts

- **Context** — the DI container: three flat registries (services, resources, entrypoints) keyed
  by alias, plus a middleware table. One context is built per process by one factory; there is no
  child context and nothing is stored for re-creation.
- **Contextual** — any object carrying `alias`, `registerContext` and `assertCtx`. It binds to
  exactly one context, the first one that registers it.
- **Service** — a contextual with an initialization state. `createService` gets an eager `init()`
  run during `context.init()`; `createLazyService` gets `lazyInit()` started on first lookup.
  Both expose `ready()`.
- **Stage** — `ContextStage.Configuration` → `Loading` (after `configure()`) → `Ready` (after
  `init()` resolves). `waitForConfigured()` / `waitForInitialized()` resolve at those points.
- **Middleware** — a hook keyed by `MiddlewareType` (`Config` / `Context`) and `MiddlewareStage`,
  applied at fixed points of the lifecycle (see Usage 4).
- **`append*` mixin** — an idempotent function that registers a service, resource or middleware on
  a context, optionally adds a typed accessor, and returns the same context. Layer factories are
  compositions of these.

## Usage

### 1. Author a service

`createService` wraps a partial implementation with `alias`, `initialized`, `init`, `ready` and the
contextual helpers. Inside methods, `service.assertCtx()` returns the context it was registered in.

```ts
import { createService } from '@owlmeans/context'
import type { InitializedService } from '@owlmeans/context'
import type { AppConfig, AppContext } from '../types.js'

export const INVOICE_SERVICE = 'invoice'

export interface InvoiceService extends InitializedService {
  total: (projectId: string) => Promise<number>
}

export const makeInvoiceService = (alias: string = INVOICE_SERVICE): InvoiceService => {
  const service: InvoiceService = createService<InvoiceService>(alias, {
    total: async projectId => {
      const ctx = service.assertCtx<AppConfig, AppContext>()
      const { items } = await ctx.invoices().list({ projectId })

      return items.reduce((sum, invoice) => sum + invoice.amount, 0)
    },
  })

  return service
}
```

A custom initializer is the third argument. It receives the service and returns the async function
`context.init()` runs — and it must set `initialized` itself:

```ts
export const makeReminderService = (alias: string = 'reminder'): ReminderService =>
  createService<ReminderService>(alias, { staleAfter: () => STALE_AFTER_MS }, service => async () => {
    // open connections, start timers, read config — then mark the service usable
    service.initialized = true
  })
```

### 2. Register it through an `append*` mixin

The mixin registers the service, adds a typed accessor and returns the same context. The app's
factory calls the factory of the layer below and then its own mixins.

```ts
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { makeContext as makeServerContext } from '@owlmeans/server-app'

export interface WithInvoiceService {
  invoice: () => InvoiceService
}

export const appendInvoiceService = <C extends BasicConfig, T extends BasicContext<C>>(
  ctx: T, alias: string = INVOICE_SERVICE
): T & WithInvoiceService => {
  const context = ctx as T & WithInvoiceService
  if (!context.hasService(alias)) {
    context.registerService(makeInvoiceService(alias))
  }
  context.invoice = () => context.service(alias)

  return context
}

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makeServerContext<C, T>(cfg)
  appendInvoiceService<C, T>(context)

  return context
}

const context = makeContext(config)
await context.configure().init()

await context.invoice().total(projectId)
```

### 3. Look things up

`service`, `resource` and `entrypoint` throw a `SyntaxError` when the alias is not registered; use
the `has*` predicates for optional collaborators. Entrypoints are looked up by the shared protocol
declaration, which also supplies request and response types.

```ts
import { projectProtocols } from 'my-app-common'

const project = await context.entrypoint(projectProtocols.get).call({
  params: { id },
})

const policy = context.hasService(RELEASE_POLICY)
  ? context.service<ReleasePolicy>(RELEASE_POLICY)
  : null

const cache = context.resource<Resource<ProjectRecord>>(PROJECT_CACHE)
```

### 4. Lazy services and lifecycle hooks

A lazy service starts `lazyInit()` the first time `context.service(alias)` returns it and does not
wait for it, so its methods await `ready()` first:

```ts
import { createLazyService } from '@owlmeans/context'
import type { GateService } from '@owlmeans/entrypoint'

export const makeProjectGate = (alias: string = PROJECT_GATE): GateService => {
  const service: GateService = createLazyService<GateService>(alias, {
    assert: async (req, _res, params) => {
      await service.ready()
      const ctx = service.assertCtx<AppConfig, AppContext>()
      // ... check req.auth against params using ctx resources
    },
  })

  return service
}
```

Middlewares run at fixed points:

| When | Type / stage |
|------|--------------|
| `configure()` | `Config` / `Configuration` |
| `init()`, before services | `Context` / `Configuration` |
| after every eager `service.init()` | `Config` / `Loading` |
| after every `resource.init()` | `Context` / `Loading` |
| after the stage becomes `Ready` (not awaited) | `Context` / `Ready` |

`Context` / `Loading` is the moment services are initialized but nothing has started listening yet —
the place to mount a raw server route:

```ts
import { MiddlewareStage, MiddlewareType } from '@owlmeans/context'

export const appendHealthEndpoint = <C extends AppConfig, T extends AppContext<C>>(context: T): T => {
  context.registerMiddleware({
    type: MiddlewareType.Context,
    stage: MiddlewareStage.Loading,
    apply: async ctx => {
      const server = (ctx as unknown as T).getApiServer().server
      server.route({ method: 'GET', url: '/healthz', handler: async () => ({ ok: true }) })
    },
  })

  return context
}
```

Work that needs the whole context ready without blocking the factory hangs off
`waitForInitialized()`:

```ts
context.waitForInitialized().then(async () => {
  context.service<DevService>(DEV_SERVICE).setMetadataFactory(metadataFactory)
})
```

### 5. A plain contextual object

`appendContextual` turns any object into something a context can register — the basis of custom
resources and entrypoints:

```ts
import { appendContextual } from '@owlmeans/context'
import type { BasicResource } from '@owlmeans/context'

const resource = appendContextual<BasicResource>('project-cache', {
  init: async () => { /* warm up */ },
})

context.registerResource(resource)
```

## API

### Functions

| Symbol | Kind | Purpose |
|--------|------|---------|
| `makeBasicContext<C>(cfg)` | function | Build the bare container; wrapped by every layer factory |
| `makeBasicConfig<C>(type, service, cfg?)` | function | Build a `BasicConfig` with `ready: false`, empty `services`, `records`, `debug` |
| `createService<S>(alias, service, init?)` | function | Service initialized eagerly by `context.init()` |
| `createLazyService<S>(alias, service, init?)` | function | Service initialized on first `context.service(alias)` |
| `appendContextual<T>(alias, obj)` | function | Add `alias`, `registerContext`, `assertCtx` to an object |
| `assertContext(ctx, location?)` | function | Return `ctx` or throw `SyntaxError` naming `location` |

### `BasicContext<C>` members

| Member | Purpose |
|--------|---------|
| `cfg`, `config` | Config object; `config` is a promise resolving after configuration |
| `stage` | Current `ContextStage` |
| `configure()`, `init()` | Run the lifecycle; `init()` resolves once the context is `Ready` |
| `waitForConfigured()`, `waitForInitialized()` | Promises for those two points |
| `registerService`, `registerResource`, `registerEntrypoint`, `registerEntrypoints`, `registerMiddleware` | Registration; a repeated alias replaces the earlier entry |
| `service(alias)`, `resource(alias)`, `entrypoint(protocol \| alias)` | Lookup; throws `SyntaxError` when missing or (eager service) not initialized |
| `hasService`, `hasResource`, `hasEntrypoint` | Presence checks by alias |
| `entrypoints()` | Every registered entrypoint |

### Constants and enums

| Symbol | Kind | Purpose |
|--------|------|---------|
| `AppType` | enum | `Backend`, `Frontend` |
| `ContextStage` | enum | `Configuration`, `Loading`, `Ready` |
| `MiddlewareType` | enum | `Config`, `Context` |
| `MiddlewareStage` | enum | `Configuration`, `Loading`, `Ready` |
| `CONFIG_RECORD` | const | Config key holding `ConfigRecord[]` (`'records'`) |
| `EMPTY_ENTITY`, `EMPTY_PROFILE` | const | Placeholders for an unset organization entity or profile |
| `ROOT` | const | Intermediate base route alias |
| `HOME` | const | Default final route alias |
| `GUEST` | const | Intermediate area without authentication |
| `BASE` | const | Intermediate area requiring authentication |
| `CRASH` | const | Fallback error screen alias |

### Types

| Symbol | Kind | Purpose |
|--------|------|---------|
| `BasicConfig` | interface | `ready`, `service`, `alias?`, `type`, `services?`, `records?`, `debug?` |
| `ConfigRecord` | interface | Free-form config record with `id` and optional `recordType` |
| `BasicContext<C>` | interface | The container (members above) |
| `Contextual` | interface | `ctx?`, `alias`, `registerContext`, `assertCtx` |
| `Service` | interface | Contextual with `initialized`, `init?`, `lazyInit?`, `ready?` |
| `InitializedService` | interface | Service with required `init` and `ready` |
| `LazyService` | interface | Service with required `lazyInit` and `ready` |
| `InitMethod<S>` | interface | `(service) => () => Promise<void>` custom initializer |
| `BasicResource` | interface | Contextual with optional `init` |
| `BasicEntrypoint` | interface | Contextual marked `_entrypoint: true` |
| `EntrypointReference<T>` | interface | `{ alias, entrypointType? }` — what a protocol declaration satisfies for typed lookup |
| `Middleware` | interface | `type`, `stage`, `apply(context, args?)` |

## Common pitfalls

- Pass protocol declarations to `context.entrypoint(...)`, never alias strings — the declaration
  carries the request and response types.
- Build one context per process with one factory; do not create child contexts or reuse a service
  object in a second context — it stays bound to the first one.
- A custom `init` passed to `createService` must set `service.initialized = true`, or
  `context.service(alias)` throws "is not initialized".
- `context.service(alias)` on a lazy service does not wait for `lazyInit()`; methods await
  `service.ready()` before touching state.
- Registering an alias twice silently replaces the earlier entry — guard `append*` mixins with
  `has*` so they stay idempotent.
- `Context` / `Ready` middlewares are not awaited by `init()`; do not rely on them having finished.
- Keep the organization `entitySlug` on the wire; resolve the stable `entityId` inside the context
  before persisting relations or calling third parties.

## Related packages

- [`@owlmeans/config`](../config) — the application config built on `BasicConfig`
- [`@owlmeans/entrypoint`](../entrypoint) — protocol declarations looked up through `context.entrypoint`
- [`@owlmeans/resource`](../resource) — the resource contract registered through `registerResource`
- [`@owlmeans/server-context`](../server-context) — server-side context layer
- [`@owlmeans/client-context`](../client-context) — client-side context layer
- [`@owlmeans/server-app`](../server-app) — top-level server context factory
- [`@owlmeans/web-panel`](../web-panel) — top-level browser context factory

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
