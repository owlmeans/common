---
name: entrypoint
description: How to use @owlmeans/entrypoint — declarative entrypoint definitions over immutable route declarations, with entrypoint(), guard(), gate(), filter(), body(), params(), query() builders, the address accessors, and the transport seam. Auto-invoked when importing from this package or defining a service entrypoint declaration.
user-invocable: false
---

# @owlmeans/entrypoint

**Layer:** Core
**Install:** `"@owlmeans/entrypoint": "^0.1.18-rc.10"` in `dependencies`

An entrypoint is a **URL unit**: an immutable route declaration plus the guards, gates and schemas
it answers under. It is the single concept an application declares once in a shared package and
elevates on either side.

## Key Exports

| Export | Description |
|--------|-------------|
| `entrypoint(route, opts?)` | Declare an entrypoint on a route model |
| `guard(alias, opts?)` | Require a guard; returns options, so it wraps rather than takes them |
| `gate(alias, params, opts?)` | Require a gate; passed as the `opts` of `guard(...)` |
| `filter(filter, opts?)` | Attach request validators |
| `body(Schema)` / `params(Schema)` / `query(Schema)` / `headers(Schema)` / `response(Schema, code?)` | AJV validators composed into a `Filter` |
| `CommonEntrypoint` | The entrypoint interface — declaration, guards/gates, address accessors |
| `AbstractRequest` / `AbstractResponse` | The request and reply shapes every handler sees |
| `provideResponse(original?)` | Build a reply object a handler resolves or rejects |
| `GuardService` / `GateService` | What a guard and a gate implement |
| `EntrypointOutcome` | Enum: Ok, Accepted, Created, Finished |
| `EntrypointTransport` | `{ protocol, handle }` — a carrier bound to a route protocol |
| `transportAlias(protocol?)` | The service alias a transport registers under (`transport:<protocol>`) |

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

## Usage

Define entrypoints in a shared `common` package, then `elevate()` them with handlers in server/web packages:

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

- `@owlmeans/route` — `route()`, `RouteMethod`, `RouteProtocols`, and the address helpers under `/utils`
- `@owlmeans/auth-common` — guard aliases (`DEFAULT_GUARD`)
- `@owlmeans/error`, `@owlmeans/i18n`
