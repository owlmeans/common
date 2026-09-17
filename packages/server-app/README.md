# @owlmeans/server-app

The bootstrap package for an OwlMeans backend process. An application uses it in every HTTP or
WebSocket API service: `makeContext` builds the base server context (Fastify API server, API
client, socket service, static resources and the Ed25519 auth guard), `main` registers the
entrypoints, initializes the context and starts listening, and the package re-exports the server
vocabulary (`bind`, `handlers`, `config`, `sservice`, `route`, ...) so backend code has one import
target. Do not use it in a shared `common` package that only declares protocols (depend on
`@owlmeans/entrypoint` and `@owlmeans/route` there), in the auth manager process (use
`@owlmeans/server-auth/manager`, which has its own `makeContext` and `main`), or in a browser app
(use `@owlmeans/web-panel`).

## Installation

```bash
bun add @owlmeans/server-app@^0.1.18-rc.33
```

## Concepts

- **Application context** — one per process, built by the app's own factory that calls
  `makeContext(cfg)` and then adds its own resources and services with idempotent `append*` mixins.
  `AppConfig` / `AppContext` are the types that factory extends.
- **`customize` flag** — `makeContext(cfg, true)` skips the default in-process `AUTH_CACHE` and
  `appendAuthService`, so the app can register a shared cache (Redis) and the auth guard itself.
- **Framework entrypoints** — `entrypoints` is the list of bindings every service carries: the
  `@owlmeans/server-auth` dispatcher bindings and the `@owlmeans/api-config-server` config endpoint.
- **Bindings** — the app's server-local list of `bind(protocol, handler)` results, materialized from
  the shared protocol tree and passed to `main`.
- **Port hold** — `holdApiPort` answers on the service port while the context initializes, so a
  slow or failing boot answers 503 instead of a connection error.

## Usage

### 1. Config

`config(service, base?)` creates a backend config for the named service; `sservice` declares a
backend service route and `service` any other (frontend) one. A service with `opened: true` listens
on `0.0.0.0`, otherwise on `127.0.0.1`.

```ts
import { AppType, config, service, sservice } from '@owlmeans/server-app'
import type { AppConfig } from '@owlmeans/server-app'
import { MY_APP_API, MY_APP_WEB, commonConfig } from 'my-app-common'

export interface Config extends AppConfig { }

const cfg = config<Config>(MY_APP_API, commonConfig as Config)

sservice({ service: MY_APP_API, internalHost: 'localhost', internalPort: 3000 }, cfg)
cfg.services[MY_APP_API].opened = true

service({ type: AppType.Frontend, service: MY_APP_WEB, host: 'localhost', port: 5173 }, cfg)

export default cfg
```

### 2. Context factory

The app's factory composes the base context and adds its own resources. For development or a
single replica the defaults are enough:

```ts
import { makeContext as makeAppContext } from '@owlmeans/server-app'
import type { AppContext } from '@owlmeans/server-app'
import { appendStaticResource } from '@owlmeans/static-resource'
import type { StaticResourceAppend } from '@owlmeans/static-resource'
import type { Resource } from '@owlmeans/resource'
import type { Project } from 'my-app-common'
import type { Config } from './config.js'

export const PROJECTS = 'my-app:projects'

export interface Context<C extends Config = Config> extends AppContext<C>, StaticResourceAppend {
  project: () => Resource<Project>
}

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeAppContext<C, T>(cfg)

  appendStaticResource<C, T>(context, PROJECTS)
  context.project = () => context.getStaticResource<Project>(PROJECTS)

  return context
}
```

A scaled deployment passes `customize: true` and registers a shared auth cache before the guard:

```ts
import { klusterize, makeContext as makeAppContext } from '@owlmeans/server-app'
import { appendMongo } from '@owlmeans/mongo'
import { appendRedis } from '@owlmeans/redis'
import { makeRedisResource } from '@owlmeans/redis-resource'
import { appendAuthService, AUTH_CACHE } from '@owlmeans/server-auth'
import { appendAuthIdentityResources } from '@owlmeans/server-auth-identity'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeAppContext<C, T>(cfg, true)
  klusterize<C, T>(context)
  appendMongo<C, T>(context)
  appendRedis<C, T>(context)

  context.registerResource(makeRedisResource(AUTH_CACHE))
  appendAuthService<C, T>(context)
  appendAuthIdentityResources(context)

  // app-local Mongo resource factory, same `project()` accessor as above
  context.registerResource(makeProjectResource(PROJECTS))
  context.project = () => context.resource(PROJECTS)

  return context
}
```

### 3. Handlers bound to shared protocols

Protocols live in the shared package; guards and gates on a parent are inherited by its children.

```ts
// my-app-common/src/protocols.ts
import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { route, RouteMethod, socket } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'

const projectBase = openProtocol(route('my-app:api:project', '/project'), {
  guards: DEFAULT_GUARD,
  gate: { alias: MY_APP_GATE, params: ['my-app-project-{entity}'] },
})

export const projectProtocols = {
  base: projectBase,
  list: protocol(
    route('my-app:api:project:list', '/', { parent: projectBase, method: RouteMethod.GET }),
    contract(typed<Project[]>()),
  ),
  create: protocol(
    route('my-app:api:project:create', '/', { parent: projectBase, method: RouteMethod.POST }),
    contract.request({ body: typed<CreateProject>(CreateProjectSchema) }, typed<Project>()),
  ),
  get: protocol(
    route('my-app:api:project:get', '/:id', { parent: projectBase, method: RouteMethod.GET }),
    contract.request({ params: typed<ProjectParams>(ProjectParamsSchema) }, typed<Project>()),
  ),
  watch: protocol(
    route('my-app:api:project:watch', '/:id/watch', socket({ parent: projectBase })),
    contract.request({ params: typed<ProjectParams>(ProjectParamsSchema) }, typed<void>()),
  ),
}
```

```ts
// my-app-api/src/app/project.ts
import { handlers } from '@owlmeans/server-app'
import { requireEntityKey } from '@owlmeans/auth-common'
import { projectProtocols } from 'my-app-common'
import type { Context } from '../context.js'

const api = handlers<Context>()

export const list = api.request(projectProtocols.list, async (request, context) => {
  const { items } = await context.project().list({ entityId: requireEntityKey(request) })
  return items
})

export const create = api.body(projectProtocols.create, async (body, context, request) =>
  context.project().create({ ...body, entityId: requireEntityKey(request) }))

export const get = api.params(projectProtocols.get, async ({ id }, context, request) =>
  context.project().load({ id, entityId: requireEntityKey(request) }))
```

### 4. Entrypoint list and `main`

```ts
// my-app-api/src/entrypoints.ts
import { bind, entrypoints } from '@owlmeans/server-app'
import { connection } from '@owlmeans/server-socket'
import { projectProtocols } from 'my-app-common'
import * as project from './app/project.js'

export const appEntrypoints = [
  ...entrypoints,
  bind(projectProtocols.base),
  bind(projectProtocols.list, project.list),
  bind(projectProtocols.create, project.create),
  bind(projectProtocols.get, project.get),
  // socket protocols bind the same way; see @owlmeans/server-socket
  bind(projectProtocols.watch, connection(projectProtocols.watch, async (conn, context, request) => {
    await conn.notify('project:ready', { id: request.params.id })
  })),
]

// my-app-api/src/index.ts
import { main } from '@owlmeans/server-app'
import config from './config.js'
import { makeContext } from './context.js'
import { appEntrypoints } from './entrypoints.js'

await main(makeContext(config), appEntrypoints)
```

### 5. A boot that holds the port

`main` is `registerEntrypoints` + `configure().init()` + `getApiServer().listen()`. Write it out when
something must run between init and listen, or when the port must answer during a long boot:

```ts
import { holdApiPort } from '@owlmeans/server-app'
import type { ApiPortHold } from '@owlmeans/server-app'

const boot = async () => {
  let hold: ApiPortHold
  try {
    hold = await holdApiPort(config, { okPath: '/healthz', payload: () => ({ status: 'booting' }) })
  } catch (error) {
    console.error('port is taken', error)
    process.exit(1) // a failed bind must be fatal
  }

  const context = makeContext(config)
  context.registerEntrypoints(appEntrypoints)
  try {
    await context.configure().init()
    await seed(context)
  } catch (error) {
    console.error('boot failed', error) // the hold keeps answering 503
    return
  }

  await hold.release()
  await context.getApiServer().listen()
}

await boot()
```

## API

### Bootstrap

| Symbol | Kind | Purpose |
|---|---|---|
| `makeContext<C, T>(cfg, customize = false)` | function | Server context with API server, API client, socket service and middleware, default static resource; unless `customize`, also a static `AUTH_CACHE` and `appendAuthService` |
| `main<R, C, T>(ctx, entrypoints)` | function | Register entrypoints, `configure().init()`, then `getApiServer().listen()` |
| `entrypoints` | const | Framework bindings: `@owlmeans/server-auth` dispatcher + `@owlmeans/api-config-server` |
| `AppConfig` | type | `ServerConfig & KlusterConfig` with `services: Record<string, ServiceRoute>` |
| `AppContext<C>` | type | `ServerContext<C> & AuthServiceAppend & ApiServerAppend` |

### Re-exports

| Symbol | Kind | Source |
|---|---|---|
| `config` | function | `@owlmeans/server-context` — `config(service, cfg?)` |
| `sservice` | function | `@owlmeans/server-config` — declare a backend service route |
| `service`, `toConfigRecord`, `PLUGINS` | function / const | `@owlmeans/config` |
| `PluginConfig` | type | `@owlmeans/config` |
| `addWebService` | function | `@owlmeans/client-config` |
| `contract`, `protocol`, `typed`, `EntrypointOutcome` | function / enum | `@owlmeans/entrypoint` |
| `Request`, `Response` | type | `AbstractRequest`, `AbstractResponse` from `@owlmeans/entrypoint` |
| `bind`, `bindAll` | function | `@owlmeans/server-entrypoint` |
| `handlers`, `holdApiPort` | function | `@owlmeans/server-api` |
| `handleBody`, `handleParams`, `handleRequest`, `handleIntermediate` | function | `@owlmeans/server-api` — unbound compatibility wrappers |
| `ApiPortHold`, `ApiPortHoldOptions` | type | `@owlmeans/server-api` |
| `route` | function | `@owlmeans/route` |
| `broute` | function | `route` from `@owlmeans/server-route` |
| `ClientEntrypoint` | type | `@owlmeans/client-entrypoint` |
| `AppType`, `BASE`, `assertContext` | enum / const / function | `@owlmeans/context` |
| `DAUTH_GUARD` | const | `DEFAULT_ALIAS` (`'auth'`) from `@owlmeans/server-auth` |
| `GUARD_ED25519`, `BED255_CASHE_RESOURCE` | const | `@owlmeans/auth-common` |
| `klusterize` | function | `@owlmeans/kluster` |
| `createListSchema`, `filterObject` | function | `@owlmeans/resource` |
| `Criteria`, `ListOptions`, `ListQuery`, `ListResult`, `Sort` | type | `@owlmeans/resource` |

## Common pitfalls

- Keep `protocol()` declarations in the shared package; a server supplies implementations with
  `bind()` and `handlers()` and never changes a declaration or finds it by alias.
- Bind parent and group declarations (`bind(projectProtocols.base)`) as well as leaves — parents
  establish inherited paths, guards and gates.
- `entrypoints` holds framework registrations. Spread it into a new local array; do not mutate it.
- The default `makeContext(cfg)` backs `AUTH_CACHE` with an in-process static resource, correct for
  one replica only. A scaled service passes `customize: true` and registers a Redis resource under
  `AUTH_CACHE` before `appendAuthService`.
- Validation belongs in `contract()` with `typed()` or `schema()`, not in a wrapper around a handler.
  Prefer `handlers<Context>()` over the unbound `handleBody` / `handleParams` / `handleRequest`.
- Key organization-scoped records on `requireEntityKey(request)` / `requireEntity(request)`; never
  read an organization id from the token — `entitySlug` is the only organization value on the wire.
- Reference other services' entrypoints with `context.entrypoint(protocol)` and the protocol object,
  without a caller-side response generic.
- A `holdApiPort` bind failure (`EADDRINUSE`) must end the process with a non-zero exit.

## Related packages

- [`@owlmeans/server-context`](../server-context) — `makeServerContext`, called by `makeContext`
- [`@owlmeans/server-api`](../server-api) — the Fastify API server and `handlers`
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — `bind` / `bindAll`
- [`@owlmeans/server-socket`](../server-socket) — WebSocket bindings
- [`@owlmeans/server-auth`](../server-auth) — the Ed25519 guard and `AUTH_CACHE`
- [`@owlmeans/server-auth-identity`](../server-auth-identity) — local identity and entity resolver
- [`@owlmeans/entrypoint`](../entrypoint) and [`@owlmeans/route`](../route) — shared protocol declarations
- [`@owlmeans/static-resource`](../static-resource) — in-memory resources
- [`@owlmeans/kluster`](../kluster) — `klusterize`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.28
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
