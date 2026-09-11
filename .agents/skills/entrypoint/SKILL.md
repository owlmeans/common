---
name: entrypoint
description: How to use @owlmeans/entrypoint — immutable typed protocols, adapter references, legacy entrypoint declarations, guards/gates/schemas, address accessors, and the transport seam. Auto-invoked when importing from this package or defining a service entrypoint declaration.
user-invocable: false
---

# @owlmeans/entrypoint

**Layer:** Core
**Install:** `"@owlmeans/entrypoint": "^0.1.18-rc.13"` in `dependencies`

An entrypoint is an **addressable unit**. New code declares an immutable typed `protocol` once in a
shared package, then binds that declaration on the client or server. The older mutable
`entrypoint(...)` + `elevate(...)` form remains supported while applications migrate.

## Key Exports

| Export | Description |
|--------|-------------|
| `protocol(route, contract, opts?)` / `openProtocol(route, opts?)` | Declare an immutable shared protocol |
| `contract(...)` / `contract.request(...)` | Declare the request sections and response together |
| `schema<T>(value)` / `typed<T>()` | Carry runtime validation plus type inference, or type information only |
| `protocols(tree)` | Flatten a named protocol tree for a layer binding |
| `entrypointRef<Request, Response>(alias)` | Typed adapter reference for dynamic registries |
| `decorateEntrypoint(protocol, opts)` | Return an immutable protocol with added access/options |
| `entrypoint(route, opts?)` | Declare an entrypoint on a route model |
| `guard(alias, opts?)` | Require a guard; returns options, so it wraps rather than takes them |
| `gate(alias, params, opts?)` | Require a gate; passed as the `opts` of `guard(...)` |
| `filter(filter, opts?)` | Attach request validators |
| `body(Schema)` / `params(Schema)` / `query(Schema)` / `headers(Schema)` / `response(Schema, code?)` | AJV validators composed into a `Filter` |
| `CommonEntrypoint` | The entrypoint interface — declaration, guards/gates, address accessors |
| `AbstractRequest` / `AbstractResponse` | The request and reply shapes every handler sees |
| `ResolvedEntity` | `req.entity` — the organization entity's `{ id, slug, iamKey }` |
| `provideResponse(original?)` | Build a reply object a handler resolves or rejects |
| `EntrypointHandler` | What a handler implements: `(req, res) => value` |
| `Filter` | The composed validator set: `{ body, params, query, headers, response }` |
| `GuardService` / `GateService` | What a guard and a gate implement |
| `EntrypointOutcome` | Enum: Ok, Accepted, Created, Finished |
| `EntrypointTransport` | `{ protocol, handle }` — a carrier bound to a route protocol |
| `transportAlias(protocol?)` | The service alias a transport registers under (`transport:<protocol>`) |

## Typed protocol form

Application contracts export protocol objects, not alias strings or already context-bound
entrypoints. A protocol owns the route, request/response contract, guards, gate and sticky flag; it
is frozen and never mutated by either runtime.

```typescript
import { contract, openProtocol, protocol, protocols, schema, typed } from '@owlmeans/entrypoint'
import { frontend, route, RouteMethod } from '@owlmeans/route'

const ItemParamsSchema = schema<{ id: string }>({
  type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false,
})

const apiBase = protocol(route('api:item', '/items'), contract())
export const item = {
  base: apiBase,
  get: protocol(
    route('api:item:get', '/:id', { parent: apiBase, method: RouteMethod.GET }),
    contract.request({ params: ItemParamsSchema }, typed<Item>()),
  ),
}
export const web = {
  items: openProtocol(route('web:items', '/items', frontend())),
}
export const itemEntrypoints = protocols(item)
```

`contract()` means no payload and an `undefined` reply. With one source it declares only the
response; with two it declares body then response. Use `contract.request` when params, query,
headers or several request sections participate. `schema<T>` is the preferred source when runtime
validation exists; `typed<T>()` is only the compile-time half.

`context.entrypoint(protocolOrRef)` infers the exact registered `call`/`invoke`/`url` signature.
Use the protocol object inside an application. Use `entrypointRef` only in an adapter package that
must address a dynamically registered surface without importing its declaration tree.

`guard`, `gate` and `filter` are **options-object combinators, not variadic composers**. Each
returns a `CommonEntrypointOptions` and takes the next one as its final argument, so they nest:

```typescript
entrypoint(
  route(app.api.item.remove, '/:id', { parent: app.api.item, method: RouteMethod.DELETE }),
  guard(DEFAULT_GUARD, gate(OIDC_GATE, ['item--delete@id']))
)
```

Guards and gates are **inherited by child entrypoints** and enforced by the framework before a
handler runs — a handler that re-checks them is duplicating an enforced rule, and is wrong even
when it agrees.

`sticky: true` in the options exempts a frontend entrypoint from the **service** filter the client
router applies while building its entrypoint tree: without it, only entrypoints that name no service
or name the context's own service are attached, so a route belonging to another service (an
authentication dispatcher, say) needs it to reach the router at all. It changes nothing else — not
the frontend-only restriction, not route matching — and defaults to `false`.

## Subpath Exports

- `./utils` — entrypoint construction helpers (`isEntrypoint`, `CreateEntrypointSignature`)

## Declaration and model

The `RouteDeclaration` an entrypoint carries is plain, immutable data: its `path` is the **segment**
this entrypoint contributes under its parent, and nothing rewrites it. `RouteModel` only wraps that
declaration. Every address question is therefore a question about the declaration asked **against
the context that asks it** — computed on demand, never stored — so the same declaration answers one
way in a server and another in a client without being touched.

| Accessor | Answers |
|----------|---------|
| `segment()` | The segment declared under the parent |
| `path()` | Every ancestor's segment, then this one |
| `mount()` | `base` + `path()` — what a server registers and a client requests |
| `service()` | The resolved service route this entrypoint answers on |
| `address()` | `{ host, port, base, secure, protocol }` — where it actually answers |
| `isLocal()` | Does it belong to the service the asking context IS? |
| `parent()` | The parent entrypoint, or `null` |
| `getGuards()` | Own guards plus every ancestor's, deduped |
| `getGates()` | Own gate plus every ancestor's, as `[gate, params]` |

`getGuards()` and `getGates()` walk the chain afresh on every call and are never memoised: a guard
attached to an ancestor after this entrypoint was first asked still has to count.

## What a handler receives

`AbstractRequest` carries `params`, `body`, `query`, `headers` and `path`, plus `auth` once a guard
has run. `req.entity` is the organization entity resolved from `auth.entitySlug` **once**, at the
server boundary: `entity.id` is the stable value to key records, grants and generated names by,
`entity.slug` is the renameable name a person reads, and `entity.iamKey` is the frozen identifier
external systems already know the organization under. It is absent when no resolver is registered,
so read it defensively rather than assuming it.

`timeout` and `signal` on a request are forwarded to the transport, so a caller can bound or abort a
single round trip.

## Calling an entrypoint

Three explicit verbs, so the caller says which answer it wants:

```typescript
const project = await ep.call({ params: { id } })            // the VALUE; the reply error is thrown
const { value, outcome } = await ep.invoke({ body })         // value AND outcome
const href = await ep.url({ params: { id } }, { absolute: true })   // the URL string
```

Use `invoke` only where the outcome decides what happens next; `call` covers everything else. An
entrypoint that **renders a screen** is addressed by URL and never over the wire — it throws from
`call()`/`invoke()` telling the caller to use `url()`.

The three verbs sit on the callable entrypoint that `@owlmeans/client-entrypoint` produces; the
declaration built here is what they address.

## Elevation

`elevate` replaces the declaration in the entrypoint list with its elevated counterpart, so it is
**idempotent**: elevating the same alias again simply replaces the element once more. Guards passed
at elevation are **unioned** with the ones the entrypoint declared — elevating adds guards, it never
swaps them. Server-side elevation lives in `@owlmeans/server-entrypoint`, client-side callability is
an explicit opt-in through `@owlmeans/client-entrypoint`.

## Transport seam

A route names the protocol it answers on, and a protocol may be carried by something other than
HTTP. A service registered under `transportAlias(protocol)` implementing `EntrypointTransport` takes
the call, so a consumer writes `ep.call(...)` and never learns whether that became an HTTP request,
a socket message or a queued job. Bind nothing and the call goes over HTTP.

```typescript
import { transportAlias } from '@owlmeans/entrypoint'
import type { EntrypointTransport } from '@owlmeans/entrypoint'
import { RouteProtocols } from '@owlmeans/route'
import { createService } from '@owlmeans/context'

const transport = createService<EntrypointTransport>(transportAlias(RouteProtocols.SOCKET), {
  protocol: RouteProtocols.SOCKET,
  handle: async (req, res) => { /* carry the call, resolve or reject res */ }
}, service => async () => { service.initialized = true })

context.registerService(transport)
```

`@owlmeans/queue` is the worked example: `appendQueueTransport(context)` binds
`RouteProtocols.QUEUE`, and a declaration built with `job()` instead of `backend()` is then carried
as a broker job. Nothing at the call site changes — which is the point of putting the protocol on
the route rather than at the call.

## Legacy declaration form

Existing applications may define entrypoints in a shared `common` package, then `elevate()` them
with handlers in server/web packages. Do not introduce this form into a protocol-based surface.

```typescript
import { entrypoint, guard, gate, filter, body } from '@owlmeans/entrypoint'
import { route, RouteMethod } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { OIDC_GATE } from '@owlmeans/oidc'
import { CreateProjectSchema } from './schemas.js'

export const managerEntrypoints = [
  entrypoint(
    route(manager.back.account.base, '/account'),
    guard(DEFAULT_GUARD, gate(OIDC_GATE, [`my-service-account-{entity}`]))
  ),
  entrypoint(
    route(manager.back.project.create, '/create', {
      parent: manager.back.project.base,
      method: RouteMethod.POST,
    }),
    filter(body(CreateProjectSchema))
  ),
]
```

## Depends On

- `@owlmeans/route` — `RouteModel`, `RouteAddress`, `RouteProtocols`, and the address helpers under `/utils`
- `@owlmeans/context` — `appendContextual`, and the `BasicEntrypoint` / service shapes an entrypoint and its guards, gates and transports register as
- `@owlmeans/auth` — `Auth`, the type behind `req.auth`
- `ajv` — the JSON-schema types `body()` / `params()` / `query()` / `headers()` / `response()` are declared with

Guard and gate **aliases** are not declared here: an entrypoint names a guard by string, and the
package that implements the guard owns the constant (`DEFAULT_GUARD` comes from
`@owlmeans/auth-common`, `OIDC_GATE` from `@owlmeans/oidc`). That is what keeps this package free of
any dependency on the auth stack.
