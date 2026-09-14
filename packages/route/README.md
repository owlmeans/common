# @owlmeans/route

The route declaration vocabulary for OwlMeans entrypoints. An app imports it in its shared contract
package, next to `@owlmeans/entrypoint`, to state for each entrypoint the URL segment, parent,
HTTP method, app type (backend or frontend) and transport (HTTP, WebSocket or queue). It is not a
router and serves nothing: server binding is `@owlmeans/server-route` / `@owlmeans/server-app`,
client binding is `@owlmeans/client-route` / `@owlmeans/client-entrypoint`, UI routing is
`@owlmeans/router`. Application code usually reads addresses through the entrypoint accessors
(`path()`, `mount()`, `address()`) rather than through this package's `./utils`.

A `RouteDeclaration` is plain, immutable data: its `path` is the segment the route contributes under
its parent, and it is never rewritten. Where the route actually answers — the full path, the mount
under a service base, the host and scheme — is computed on demand from the declaration plus the
context that asks, so the same declaration serves a server and a browser alike.

## Installation

```bash
bun add @owlmeans/route@^0.1.18-rc.17
```

## Concepts

- **Declaration** — the `RouteDeclaration` a `route()` call produces: `alias`, `path` (the segment
  under `parent`), `type`, `method`, `protocol`, the service coordinates, and the queue fields.
- **Model** — `RouteModel` is `{ route: RouteDeclaration }` and nothing more. `protocol()` and
  `openProtocol()` from `@owlmeans/entrypoint` take it as their first argument.
- **Marker** — `backend()`, `frontend()`, `socket()`, `job()` return `Partial<RouteOptions>` that set
  the app type and protocol; `route()` accepts them as its options.
- **Parent** — a route nests under another entrypoint. Pass the parent protocol object
  (`parent: storyProtocols.base`); the declaration stores only its alias.
- **Service** — `service` names the configured service (`cfg.services`) that answers the route.
  Without it the route belongs to the asking context's own service or the default one of its type.
- **Protocol** — `RouteProtocols` picks the transport that carries a call: HTTP request, socket
  frame or queued job. The call site never chooses.

## Usage

### A backend protocol tree

Aliases stay private to the declaration module; the exported value is a tree of protocol objects.

```ts
import { contract, protocol } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { InvoiceSchema, CreateInvoiceBodySchema } from './schemas.js'

const aliases = {
  base: 'my-app:api:invoice:base',
  list: 'my-app:api:invoice:list',
  create: 'my-app:api:invoice:create',
} as const

const base = protocol(route(aliases.base, '/invoice', backend()), contract(), {
  guards: DEFAULT_GUARD,
})

export const invoiceProtocols = {
  base,
  list: protocol(
    route(aliases.list, '/', backend({ parent: base, method: RouteMethod.GET })),
    contract(InvoiceSchema),
  ),
  create: protocol(
    route(aliases.create, '/', backend({ parent: base, method: RouteMethod.POST })),
    contract(CreateInvoiceBodySchema, InvoiceSchema),
  ),
} as const
```

`invoiceProtocols.create` resolves to `/invoice` on the backend service, answering `POST`, and
inherits the guard declared on `base`.

### Path params, screens and default children

Path params use the `:name` form and are typed through `contract.request`. `frontend()` marks a
screen; `default: true` marks the child screen shown at the parent's path.

```ts
import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { backend, frontend, route, RouteMethod } from '@owlmeans/route'
import type { ProjectParams, Project, RenameProject } from './types.js'
import { ProjectParamsSchema, RenameProjectSchema } from './schemas.js'

const aliases = {
  base: 'my-app:api:project:base',
  rename: 'my-app:api:project:rename',
  web: 'my-app:web:project:base',
  dashboard: 'my-app:web:project:dashboard',
  overview: 'my-app:web:project:overview',
} as const

const base = openProtocol(route(aliases.base, '/project', backend()))
const web = openProtocol(route(aliases.web, '/project/:projectId', frontend()))

export const projectProtocols = {
  base,
  rename: protocol(
    route(aliases.rename, '/:id/rename', backend({ parent: base, method: RouteMethod.PATCH })),
    contract.request(
      { params: typed<ProjectParams>(ProjectParamsSchema), body: typed<RenameProject>(RenameProjectSchema) },
      typed<Project>(),
    ),
  ),
  web: {
    base: web,
    dashboard: openProtocol(route(aliases.dashboard, '/dashboard', frontend({ parent: web }))),
    overview: openProtocol(route(aliases.overview, '/', frontend({ parent: web, default: true }))),
  },
} as const
```

### Sockets, queued jobs and other services

`socket()` and `job()` are `backend()` with a different protocol. A route pointed at another
service carries `service`; a queue route also names its `queue`, `timeout` and, optionally, `reply`.

```ts
import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { job, route, RouteMethod, socket } from '@owlmeans/route'
import { GUARD_ED25519 } from '@owlmeans/auth-common'
import type { ProjectParams, StoryUpdate, Story } from './types.js'
import { ProjectParamsSchema } from './schemas.js'

const WORKER = 'my-app-worker'
const aliases = {
  updates: 'my-app:api:update:base',
  story: 'my-app:api:update:story',
  jobs: 'my-app:worker:story:base',
  develop: 'my-app:worker:story:develop',
  cleanup: 'my-app:worker:story:cleanup',
} as const

const updates = openProtocol(route(aliases.updates, '/update'))
const jobs = openProtocol(route(aliases.jobs, '/story', { service: WORKER }), { guards: GUARD_ED25519 })

export const storyProtocols = {
  updates,
  // WebSocket subscription under /update
  story: protocol(
    route(aliases.story, '/story/:id', socket({ parent: updates })),
    contract.request({ params: typed<ProjectParams>(ProjectParamsSchema) }, typed<StoryUpdate>()),
  ),
  jobs,
  // Queued job: the caller waits up to timeout ms for the job's result
  develop: protocol(
    route(aliases.develop, '/:id/develop', job({
      parent: jobs, method: RouteMethod.POST, service: WORKER, queue: 'story-work', timeout: 600_000,
    })),
    contract.request({ params: typed<ProjectParams>(ProjectParamsSchema) }, typed<Story>()),
  ),
  // reply: false resolves once the broker accepts the job; the outcome is Accepted
  cleanup: protocol(
    route(aliases.cleanup, '/:id/cleanup', job({
      parent: jobs, method: RouteMethod.POST, service: WORKER, queue: 'story-ops', reply: false, timeout: 30_000,
    })),
    contract.request({ params: typed<ProjectParams>(ProjectParamsSchema) }, typed<unknown>()),
  ),
} as const
```

Which queues a process consumes is configuration of that process (`listenQueues()`), never part of
the declaration.

### Reading where a route answers

Once protocols are registered on a context, the entrypoint accessors answer address questions. The
`./utils` helpers are the same functions over a bare declaration.

```ts
import { AppType } from '@owlmeans/context'
import { service } from '@owlmeans/config'
import { resolveAddress, resolveMount } from '@owlmeans/route/utils'
import { invoiceProtocols } from 'my-app-common'

// Config side: the service the backend routes resolve against
const cfg = service({ service: 'my-app-api', type: AppType.Backend, host: 'localhost', port: 8080, base: 'api' }, baseCfg)

// Runtime side, through the registered entrypoint
const entrypoint = context.entrypoint(invoiceProtocols.create)
entrypoint.path()    // '/invoice'
entrypoint.mount()   // '/api/invoice'
entrypoint.address() // { host: 'localhost', port: 8080, base: 'api', secure: true, protocol: 'http' }
entrypoint.isLocal() // true inside the my-app-api process

// Same answers from a declaration
const declaration = invoiceProtocols.create.route.route
resolveMount(context, declaration)
resolveAddress(context, declaration)
```

## API

### `@owlmeans/route`

| Symbol | Kind | Purpose |
|--------|------|---------|
| `route(alias, path, opts?)` | function | Build a `RouteModel`; `opts` is `RouteOptions` or a parent alias string |
| `createRoute(alias, path, opts?)` | function | Build the bare `RouteDeclaration` (parent reference collapsed to its alias) |
| `makeRouteModel(declaration)` | function | Wrap a declaration as `{ route }` |
| `backend(opts?, method?)` | function | Mark `AppType.Backend`; `opts` is options, a parent alias or `null`; `method` is a `RouteMethod` or more options |
| `frontend(opts?, default?)` | function | Mark `AppType.Frontend`; `default` is a boolean flag or more options |
| `socket(opts?, secondary?)` | function | `backend()` with `protocol: RouteProtocols.SOCKET` |
| `job(opts?, secondary?)` | function | `backend()` with `protocol: RouteProtocols.QUEUE` |
| `service(alias, opts?)` | function | Set `service` on `opts` (mutated and returned) |
| `rtype(type, opts?)` | function | Set an arbitrary `AppType`; the primitive behind `backend()` / `frontend()` |
| `normalizePath(path)` | function | Trim whitespace and one leading and trailing `/` |
| `RouteMethod` | enum | `GET = 'get'`, `POST = 'post'`, `PATCH = 'patch'`, `PUT = 'put'`, `DELETE = 'delete'` |
| `RouteProtocols` | enum | `WEB = 'http'`, `SOCKET = 'ws'`, `QUEUE = 'queue'` |
| `SEP` | const | Path separator `'/'` |
| `PARAM` | const | Path param prefix `':'` |
| `BasicRoute` | interface | `type`, `service?`, `host?`, `port?`, `base?`, `internalHost?`, `internalPort?` |
| `RouteDeclaration` | interface | `BasicRoute` + `alias`, `path`, `parent?`, `default?`, `method?`, `protocol?`, `secure?`, `queue?`, `reply?`, `timeout?` |
| `RouteOptions` | interface | `Partial<RouteDeclaration>` whose `parent` is a `RouteParent` |
| `RouteParent` | type | `string \| EntrypointReference` |
| `RouteModel` | interface | `{ route: RouteDeclaration }` |
| `RouteAddress` | interface | `{ host, port?, base?, secure, protocol }` |
| `CommonServiceRoute` | interface | A service entry: `BasicRoute` + `service`, `home?`, `default?` |
| `ResolvedServiceRoute` | interface | A service entry that names its `host` |

### `@owlmeans/route/utils`

The first six take `(context, declaration)`; the other four are pure and take no context.

| Symbol | Kind | Purpose |
|--------|------|---------|
| `resolvePath(context, route)` | function | Every ancestor's segment, then this one |
| `resolveMount(context, route)` | function | Service `base` + the full path |
| `resolveService(context, route)` | function | The named service, else the default of the route's type, else the first of that type |
| `resolveAddress(context, route)` | function | The `RouteAddress`; a hop over the service's internal host is never TLS |
| `isLocalRoute(context, route)` | function | Does the route belong to the context's own service |
| `getParentRoute(context, route)` | function | The parent declaration, with parentship-cycle detection |
| `overrideParams(route, overrides?, filter?)` | function | Fill only blank fields of `route` from `overrides`; mutates, returns nothing |
| `prependBase(route, path)` | function | `path` prefixed with `route.base` when set |
| `isServiceRoute(obj?)` | type guard | Is `obj` a `CommonServiceRoute` with a known `AppType` |
| `isServiceRouteResolved(route)` | type guard | Does the service entry name a host |
| `CreateRouteSignature<R>` | interface | Call signature shared by `route()` and `createRoute()` |

## Common pitfalls

- Pass the parent protocol object in route options, never an exported alias string. Keep aliases
  private to the declaration module and export a `*Protocols` tree.
- The positional marker forms (`backend(parent, method)`, `frontend(parent, true)`) accept a parent
  only as an alias string: a protocol object in first position is spread into the options and
  overwrites the child's alias. Pass protocols as `{ parent }`.
- `path` is only this route's segment. Do not repeat the parent's path in it; `resolvePath()` joins
  the chain.
- `job()` routes must name `service`, `queue` and `timeout`. `reply: false` returns the job identity
  with an `Accepted` outcome, not the job's result.
- Do not pass a context to the pure `./utils` helpers: `overrideParams(ctx, decl)` writes route
  fields into the context object instead of resolving anything.
- A mis-wired tree (no `cfg.services`, a service without a host, a parentship cycle) throws
  `SyntaxError` when an address is resolved. Fix the config; do not catch it.
- `transportAlias` and `EntrypointTransport` live in `@owlmeans/entrypoint`, not here. A route only
  names its protocol.

## Related packages

- [`@owlmeans/entrypoint`](../entrypoint) — `protocol()` / `openProtocol()` consume a `RouteModel` and
  expose `path()`, `mount()`, `address()`, `isLocal()`
- [`@owlmeans/context`](../context) — `AppType`, `EntrypointReference` and the registry the address helpers walk
- [`@owlmeans/config`](../config) — `service()` declares the service entries routes resolve against
- [`@owlmeans/server-route`](../server-route) — server-side route model; re-exported by
  [`@owlmeans/server-app`](../server-app) as `broute`
- [`@owlmeans/client-route`](../client-route) — marks a route as client-side and extracts its params
- [`@owlmeans/queue`](../queue) — the QUEUE transport a `job()` route is carried by
- [`@owlmeans/socket`](../socket) — the SOCKET transport contracts

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.20
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
