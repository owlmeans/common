---
name: entrypoint
description: How to use @owlmeans/entrypoint — immutable protocol objects, typed contracts and schemas, protocol trees, registered entrypoints, route inheritance, and the transport seam. Auto-invoked when importing from this package or defining a service protocol.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/entrypoint

**Layer:** Core
**Install:** `"@owlmeans/entrypoint": "^0.1.18-rc.11"` in `dependencies`

An entrypoint protocol is an **immutable contract object**: route, request/reply types, runtime
schemas, guards and gate. Shared packages export protocol objects; server and client packages bind
those exact objects into context-owned registered entrypoints. Public trees expose objects, never
alias strings. An alias is only a registry/broker adapter detail available as `protocol.alias`.

## Key Exports

| Export | Description |
|--------|-------------|
| `protocol(route, contract, opts?)` / `openProtocol(route, opts?)` | Declare an immutable typed protocol; use `openProtocol` only while a surface has no contract. |
| `contract()` / `contract(response)` / `contract(body, response)` / `contract.request({...}, response)` | Declare exact request sections and reply type. |
| `schema<T>(jsonSchema)` / `typed<T>(schema?)` | Brand a reusable AJV schema with its model type, or supply a type-only contract. |
| `protocols(tree)` | Flatten a nested protocol tree without losing declaration identity. |
| `RequestOf<P>` / `ResponseOf<P>` / `BodyOf<P>` / `ParamsOf<P>` | Infer a declaration's exact I/O types. |
| `RegisteredEntrypoint<Request, Response>` | Context-bound callable form returned for a protocol lookup. |
| `entrypointRef(alias)` | Explicit typed adapter for code that cannot yet import the protocol object. |
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

`entrypoint`, `guard`, `gate` and `filter` are the materialized compatibility surface. New shared
declarations use protocol objects. On that compatibility surface, `guard`, `gate` and `filter` are
**options-object combinators, not variadic composers**. Each
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

## Calling a registered protocol

Three explicit verbs, so the caller says which answer it wants:

```typescript
const project = await ctx.entrypoint(app.project.get).call({ params: { id } })
const { value, outcome } = await ctx.entrypoint(app.project.create).invoke({ body })
const href = await ctx.entrypoint(app.project.get).url({ params: { id } }, { absolute: true })
```

Use `invoke` only where the outcome decides what happens next; `call` covers everything else. An
entrypoint that **renders a screen** is addressed by URL and never over the wire — it throws from
`call()`/`invoke()` telling the caller to use `url()`.

`ctx.entrypoint(protocol)` reads the exact registered type through the object's branded reference;
never replace it with `ctx.entrypoint<SomeGeneric>(protocol.alias)`. The latter lets a caller claim
an I/O type the declaration never made.

## Elevation

Server code binds `protocols(tree)` with protocol-bound handlers. Client code registers
`bindAll(tree)` or `bind(protocol)`. Both preserve object identity and exact inference. String
`elevate(list, alias, ...)` remains only for legacy materialized declarations.

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

## Protocol declaration

Define a tree in a shared package. Parent routes receive the parent protocol object, not its alias:

```typescript
import { contract, protocol, protocols, schema } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { CreateProjectSchema } from './schemas.js'

const base = protocol(route('app:project', '/project', backend()), contract(), {
  guards: DEFAULT_GUARD,
})
export const project = {
  base,
  create: protocol(
    route('app:project:create', '/create', backend({ parent: base, method: RouteMethod.POST })),
    contract(CreateProjectSchema, ProjectSchema),
  ),
} as const
export const projectEntrypoints = protocols(project)
```

Brand model schemas once with `schema<Model>(...)`. `contract(body, response)` means a body
request; use `contract.request({ params, query, headers, body }, response)` when sections differ.
Use `typed<T>()` only when no runtime schema can exist, because it supplies no validation.

When a protocol is materialized for Fastify, its default response schema is registered under
HTTP status `200`; explicit response-status schemas retain their declared status key. A bare
response schema is not a valid Fastify serializer declaration.

## Depends On

- `@owlmeans/route` — `RouteModel`, `RouteAddress`, `RouteProtocols`, and the address helpers under `/utils`
- `@owlmeans/context` — `appendContextual`, and the `BasicEntrypoint` / service shapes an entrypoint and its guards, gates and transports register as
- `@owlmeans/auth` — `Auth`, the type behind `req.auth`
- `ajv` — the JSON-schema types `body()` / `params()` / `query()` / `headers()` / `response()` are declared with

Guard and gate **aliases** are not declared here: an entrypoint names a guard by string, and the
package that implements the guard owns the constant (`DEFAULT_GUARD` comes from
`@owlmeans/auth-common`, `OIDC_GATE` from `@owlmeans/oidc`). That is what keeps this package free of
any dependency on the auth stack.
