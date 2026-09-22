# @owlmeans/entrypoint

Entrypoint protocol system — the typed route contract shared between server and client in OwlMeans
apps. An application uses it in its shared (`common`) package to declare every addressable unit —
an HTTP API route, a socket or a screen — once, as an immutable protocol with typed
request sections, a response type, AJV schemas and access rules. Runtime behaviour is not added
here: the server attaches handlers with `@owlmeans/server-entrypoint` / `@owlmeans/server-api`, the
client binds calls and screens with `@owlmeans/client-entrypoint`, and route shapes themselves come
from `@owlmeans/route`. Code that only calls or handles an already declared protocol imports it from
the shared package rather than declaring anything here.

The route declaration an entrypoint carries is immutable: its `path` always stays the segment this
entrypoint contributes under its parent. Addresses are computed on demand against the context the
entrypoint is registered in — `path()` walks the parent chain, `mount()` adds the service base,
`address()` picks host, port and scheme — so one declaration answers correctly on both sides.

## Installation

```bash
bun add @owlmeans/entrypoint@^0.1.18-rc.31
```

## Concepts

- **Protocol** — one immutable URL unit: an alias + route + typed contract + access options, made by
  `protocol(route, contract, options?)`. The frozen object is the only cross-layer reference;
  runtime code passes it (`context.entrypoint(protocols.x)`), never its alias string.
- **Contract** — the compile-time request/response pair plus the runtime AJV schemas, made by
  `contract(...)` or `contract.request({ body, params, query, headers }, response)` from `typed<T>()`
  and `schema<T>()` sources. All validation lives at protocol level, keeping data contracts
  consistent fullstack.
- **Protocol tree** — an exported `*Protocols` object whose property names describe the contract.
  Aliases stay private to the declaring module; the tree is flattened with `protocols(tree)` only at
  registration.
- **Access options** — `guards`, `gate` and `sticky` in `EntrypointOptions`. Guards and gates are
  inherited through the route parent when a runtime binds the protocol.
- **Binding / materialization** — a side-specific package turns a declaration into a context-bound
  `CommonEntrypoint` (`materializeEntrypoint`) and adds a handler, a call or a screen. The declaration
  itself is never mutated.
- **Transport** — the route's protocol picks a built-in or package-owned carrier through a service
  registered under `transportAlias(protocol)`; callers write `call()` and never branch on it.

## Usage

### 1. Declare a typed protocol tree

```ts
import { contract, protocol, schema, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import type { JSONSchemaType } from 'ajv'

export interface Story { id: string, title: string }
export interface CreateStory { title: string }

export const CreateStorySchema = schema<CreateStory>({
  type: 'object',
  properties: { title: { type: 'string', minLength: 1 } },
  required: ['title'],
  additionalProperties: false,
} as JSONSchemaType<CreateStory>)

// Private wire names — never exported.
const aliases = {
  base: 'my-app:story:base',
  create: 'my-app:story:create',
  get: 'my-app:story:get',
} as const

const base = protocol(route(aliases.base, '/stories', backend()), contract(), {
  guards: DEFAULT_GUARD,
})

export const storyProtocols = {
  base,
  create: protocol(
    route(aliases.create, '/', backend({ parent: base, method: RouteMethod.POST })),
    contract(CreateStorySchema, typed<Story>()),
  ),
  get: protocol(
    route(aliases.get, '/:id', backend({ parent: base })),
    contract.request({ params: typed<{ id: string }>() }, typed<Story>()),
  ),
} as const
```

`contract(body, response)` is a body-only contract; `contract.request(...)` types each request
section independently. The children inherit `DEFAULT_GUARD` from `base`.

### 2. Bind handlers on the server

```ts
import { handlers } from '@owlmeans/server-api'
import { bind } from '@owlmeans/server-entrypoint'
import { requireEntityKey } from '@owlmeans/auth-common'
import { storyProtocols } from 'my-app-common'
import type { Context } from 'my-app-backend'

const api = handlers<Context>()

const create = api.body(storyProtocols.create, async (body, context, request) =>
  context.story().create(requireEntityKey(request), body))

const get = api.params(storyProtocols.get, async ({ id }, context) =>
  context.story().get(id))

export const serverBindings = [
  bind(storyProtocols.base),
  bind(storyProtocols.create, create),
  bind(storyProtocols.get, get),
]
```

`body`, `params` and `id` are inferred from the protocol; no generic is named. The organization
record id comes from the request (`requireEntityKey`), never from the payload.

### 3. Call the protocol from a client or another service

```ts
import { bindAll } from '@owlmeans/client-entrypoint'
import { EntrypointOutcome } from '@owlmeans/entrypoint'
import { storyProtocols } from 'my-app-common'

export const clientBindings = bindAll(storyProtocols)

// Later, with a context the bindings were registered in:
const story = await context.entrypoint(storyProtocols.create).call({ body: { title: 'Invoices' } })

const { value, outcome } = await context.entrypoint(storyProtocols.get)
  .invoke({ params: { id: story.id }, timeout: 5_000 })
if (outcome !== EntrypointOutcome.Ok) {
  throw new Error(`Story ${story.id} was not loaded`)
}

const link = await context.entrypoint(storyProtocols.get).url({ params: { id: value.id } })
```

`call()` resolves the value, `invoke()` also returns the `EntrypointOutcome`, `url()` builds the
address. `CallOptions` (`auth`, `host`, `base`, `unsecure`, `timeout`, `signal`) ride alongside the
request sections and are never part of the payload contract.

### 4. Gates, socket carriers, derived types

```ts
import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import type { HandlerRequest, RequestOf, ResponseOf } from '@owlmeans/entrypoint'
import { backend, route, socket } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { PROJECT_GATE } from './consts.js'

const aliases = {
  base: 'my-app:project:base', update: 'my-app:project:update',
  watch: 'my-app:project:watch',
} as const

const base = protocol(route(aliases.base, '/projects', backend()), contract(), {
  guards: DEFAULT_GUARD,
  gate: { alias: PROJECT_GATE, params: 'my-app-project-{entity}' },
})
const updates = openProtocol(route(aliases.update, '/update'))

export const projectProtocols = {
  base,
  updates,
  // Carried over a WebSocket: the handler receives a connection, not a single reply.
  watch: protocol(
    route(aliases.watch, '/project/:id', socket({ parent: updates })),
    contract.request({ params: typed<{ id: string }>() }, typed<void>()),
  ),
} as const

type WatchRequest = HandlerRequest<RequestOf<typeof projectProtocols.watch>>
```

### 5. Decorate a whole tree without flattening it

```ts
import { decorateEntrypoint, gatesOf, mapProtocols } from '@owlmeans/entrypoint'
import { AUDIT_GUARD } from './consts.js'
import { projectProtocols } from './protocols.js'

// Add a guard to every declaration while keeping the tree paths consumers bind by.
export const auditedProtocols = mapProtocols(projectProtocols, declaration =>
  decorateEntrypoint(declaration, { guards: [...declaration.guards, AUDIT_GUARD] }))

// Resolve inherited gates without materializing anything (e.g. to hide a menu item).
const gates = gatesOf(auditedProtocols.build, auditedProtocols)
```

`decorateEntrypoint` returns a new frozen protocol with the same request/response pair; the input
tree and its protocols are left untouched.

## API

### Protocol declaration (`.`)

| Symbol | Kind | Purpose |
|---|---|---|
| `protocol(route, contract, options?)` | function | Create an immutable, typed `EntrypointProtocol` |
| `openProtocol(route, options?)` | function | Create an intentionally untyped protocol (`OpenRequest` / `OpenValue`) for escape hatches |
| `contract(...)` | function | Body-only contract: `contract()`, `contract(response)`, `contract(body, response)` |
| `contract.request(sections, response)` | function | Contract with independently typed `body`, `params`, `query`, `headers` |
| `typed<T>(schema?)` | function | Type-only source, optionally paired with an AJV schema |
| `schema<T>(jsonSchema)` | function | Brand a reusable AJV schema with its model type (`EntrypointSchema<T>`) |
| `protocols(tree)` | function | Flatten an `EntrypointTree` to a declaration array for registration |
| `mapProtocols(tree, mapper)` | function | Rebuild a frozen tree, transforming each declaration in place of its path |
| `decorateEntrypoint(protocol, options)` | function | Clone a protocol with replaced `guards` / `gate` / `sticky` |
| `gatesOf(protocol, tree)` | function | Gates a protocol inherits through its route parents, without materializing |
| `isEntrypointProtocol(value)` | function | Type guard for a protocol declaration |
| `entrypointRef<Request, Response>(alias)` | function | Typed reference for a dynamic remote address whose declaration cannot be imported |
| `aliasOf(reference)` | function | Alias of a reference or string, for registry/transport adapters |
| `materializeEntrypoint(protocol)` | function | Make a context-bindable `CommonEntrypoint` from a declaration (used by binding packages) |
| `provideResponse<T>(original?)` | function | Create an `AbstractResponse<T>` for invoking a handler or guard outside a transport |
| `transportAlias(protocol = 'http')` | function | Service alias `transport:<protocol>` a transport registers under |
| `EntrypointOutcome` | enum | `Ok`, `Accepted`, `Created`, `Finished` — returned by `invoke()` and `resolve()` |

### Contract and protocol types

| Symbol | Kind | Purpose |
|---|---|---|
| `EntrypointProtocol<Request, Response>` | interface | Typed immutable declaration; also a context reference to its registered entrypoint |
| `EntrypointProtocolDeclaration` | interface | Runtime fields common to every protocol (`alias`, `route`, `contract`, `sticky`, `guards`, `gate`) |
| `EntrypointContract<Request, Response>` | interface | Runtime schemas plus the compile-time pair |
| `EntrypointOptions` | interface | `sticky`, `guards`, `gate: { alias, params }` |
| `EntrypointGate` | interface | A resolved `{ alias, params }` gate |
| `EntrypointTree` | interface | Nested object of protocols |
| `RequestShape`, `OpenRequest`, `OpenValue` | types | Request section shape; the untyped request and value |
| `Typed<T>`, `EntrypointSchema<T>`, `ShapeSource<T>` | types | Contract sources |
| `RequestSources`, `RuntimeRequestSchemas`, `RuntimeResponseSchemas` | interfaces | Contract internals |
| `RequestOf`, `ResponseOf`, `BodyOf`, `ParamsOf`, `QueryOf`, `HeadersOf`, `CallRequestOf` | types | Derive contract types from a protocol |
| `HandlerRequest<Request>` | type | Typed request at a handler boundary, including transport metadata |
| `EntrypointRequestMeta` | interface | `alias`, `auth`, `entity`, `path`, `canceled`, `cancel` |
| `RegisteredEntrypoint<Request, Response>` | interface | Context-bound entrypoint with `call`, `invoke`, `url`, `validate` |
| `CallOptions`, `CallArguments`, `UrlArguments` | types | Addressing/transport controls and argument tuples of `call` / `url` |
| `EntrypointResult<Response>` | interface | `{ value, outcome }` returned by `invoke()` |
| `MaterializedEntrypoint<Protocol>` | type | `CommonEntrypoint` carrying its `protocol` |

### Runtime types

| Symbol | Kind | Purpose |
|---|---|---|
| `CommonEntrypoint` | interface | Bound entrypoint: `alias`, `route`, `sticky`, `guards`, `gate`, `gateParams`, `filter`, `handle`, and context-computed `segment()`, `path()`, `mount()`, `service()`, `address()`, `isLocal()`, `parent()`, `getGuards()`, `getGates()` |
| `CommonEntrypointOptions` | interface | Partial `CommonEntrypoint` options |
| `AbstractRequest<T>` | interface | Request with `alias`, `auth`, `entity`, `params`, `body`, `query`, `headers`, `path`, `timeout`, `signal` |
| `AbstractResponse<T>` | interface | Response with `value`, `outcome`, `error`, `resolve(value, outcome?)`, `reject(error)` |
| `ResolvedEntity` | interface | Organization as handlers see it: `id` (stable key), `slug`, `iamKey` |
| `EntrypointHandler`, `EntrypointMatch`, `EntrypointAssert` | interfaces | Handler, guard-match and gate-assert signatures |
| `GuardService` | interface | Guard service: `match`, `handle`, and client-side `authenticated`, `token` |
| `GateService` | interface | Lazy gate service with `assert(req, res, params)` |
| `Filter` | interface | AJV schemas by section (`query`, `params`, `body`, `response`, `headers`) |
| `EntrypointTransport` | interface | `{ protocol, handle }` — the service that carries a call for one route protocol |

### `@owlmeans/entrypoint/utils`

| Symbol | Kind | Purpose |
|---|---|---|
| `isEntrypoint(obj)` | function | Type guard for a materialized `CommonEntrypoint` |
| `CreateEntrypointSignature<M>` | interface | `(route, opts?) => M` factory signature |

### Transport

Register a service under `transportAlias(protocol)` implementing `EntrypointTransport` and every
call to an entrypoint on that route protocol goes through it. The package defining a custom
protocol owns its transport and option validation. Without a registered transport the call goes
over HTTP.

## Common pitfalls

- Do not export or import alias strings as an API. Keep them private to the declaration module and
  pass protocol objects; raw aliases belong only in dynamic registry or transport adapters.
- Do not use `openProtocol` just to skip declaring input or output types — it is for intentionally
  untyped boundaries.
- Use `typed<Model>(schema)` or `schema<Model>(...)` rather than a bare `JSONSchemaType<Model>`; a bare
  AJV generic can widen a section to `OpenValue`.
- Never mutate guards, gates, schemas or a declaration collection, and never replace an item in an
  entrypoint array. Derive with `decorateEntrypoint` / `mapProtocols` and bind that exact object.
- Reference a parent by its protocol object (`backend({ parent: base })`), not by its alias.
- Do not construct contextual compatibility entrypoints or look a protocol up by alias with a generic;
  use `entrypointRef` only when the declaration truly cannot be imported.
- Callers use `call` / `invoke` / `url` and do not branch on the carrier — the route protocol and its
  transport decide.
- Inherited gates are deduplicated by gate service: a child declaring a gate under the same service
  replaces its ancestor's gate for that service rather than adding to it.
- `request.entity` is set only where authentication ran `attachEntity`; handlers key records by
  `entity.id` (via `requireEntityKey` / `requireEntity` from `@owlmeans/auth-common`), never by the
  token's `entitySlug`.

## Related packages

- [`@owlmeans/route`](../route) — `route()`, `backend()`, `socket()`, `frontend()` used in `protocol(route(...), ...)`
- [`@owlmeans/context`](../context) — `BasicEntrypoint`, `EntrypointReference` and `context.entrypoint(...)`
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — server-side `bind()` / `bindAll()` to attach handlers
- [`@owlmeans/server-api`](../server-api) — `handlers<Context>()` with protocol-inferred `body` / `params` / `request`
- [`@owlmeans/server-socket`](../server-socket) — `connection(protocol, handler)` for socket protocols
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — client `bind()`, `bindAll()`, `bindScreen()` with typed calls
- [`@owlmeans/auth-common`](../auth-common) — guard aliases and entity helpers used in access options and handlers
- [`@owlmeans/server-app`](../server-app) — re-exports `contract`, `protocol`, `typed`, `EntrypointOutcome` and the request/response types

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
