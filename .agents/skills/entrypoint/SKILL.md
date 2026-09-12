---
name: entrypoint
description: How to declare immutable, typed @owlmeans/entrypoint protocols with protocol(), contract(), typed(), protocol trees, guards, gates, and route transports. Load before defining a shared API, socket, queue, or screen contract.
user-invocable: false
---

# @owlmeans/entrypoint

**Layer:** Core

An entrypoint protocol is the immutable shared contract for one addressable route. It owns the
route, typed request sections, response type, schemas, guards, gate, and sticky flag. Server and
client behaviour is added only by the corresponding binding package.

## Declare a named tree

```ts
import { contract, protocol, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'

export const projectEntrypoints = {
  base: protocol(route('project', '/projects', backend()), contract(typed<void>())),
  create: protocol(
    route('project:create', '/', backend('project', RouteMethod.POST)),
    contract.request({ body: typed<CreateProject>(CreateProjectSchema) }, typed<Project>()),
    { guards: DEFAULT_GUARD }
  ),
  get: protocol(
    route('project:get', '/:id', backend('project')),
    contract.request({ params: typed<{ id: string }>() }, typed<Project>())
  ),
}
```

- Export an object whose property names describe the contract. Its protocol values are the only
  cross-layer references. Flatten it with `protocols(projectEntrypoints)` only at registration.
- Use `protocol(route, contract, options?)` for every typed boundary.
- `openProtocol(route, options?)` is an intentional untyped escape hatch; do not use it merely to
  avoid declaring an input or output type.
- Use `decorateEntrypoint(protocol, options)` only when deriving an immutable decoration; never
  mutate guards, gates, schemas, or a declaration collection.

## Contract sources

| Source | Use |
|---|---|
| `typed<Model>(schema)` | A type paired with its AJV runtime validator. Prefer at declaration boundaries. |
| `typed<Model>()` | A type-only request section or response. |
| `schema<Model>(schema)` | A reusable named typed AJV schema. |
| `contract(body, response)` | A body-only contract. |
| `contract.request({ body, params, query, headers }, response)` | Independently typed request sections. |

Use `typed<Model>(schema)` rather than a bare `JSONSchemaType<Model>` when the model must remain
exact. A bare AJV generic can widen a protocol section to `OpenValue`.

`RequestOf<Protocol>`, `ResponseOf<Protocol>`, `BodyOf<Protocol>`, `ParamsOf<Protocol>`,
`QueryOf<Protocol>`, and `HeadersOf<Protocol>` derive the contract types. A handler receives
`HandlerRequest<RequestOf<Protocol>>`, which includes the transport metadata as well as the typed
sections. Use `entrypointRef<Request, Response>(alias)` only for a dynamic remote address whose
declaration is unavailable to import.

## Authorization and addressing

Add `guards`, `gate`, and `sticky` directly in `EntrypointOptions`:

```ts
protocol(route(...), contract(...), {
  guards: [DEFAULT_GUARD, AUDIT_GUARD],
  gate: { alias: PROJECT_GATE, params: ['project--read@id'] },
  sticky: true,
})
```

Guards and gates are inherited through the parent route by the bound runtime entrypoint. A route's
protocol chooses the carrier (HTTP, socket, or queue); callers only use `call`, `invoke`, or `url`
on the client-bound protocol and do not branch on a transport.

## Bind, never replace

- Server: `bind(protocol, handlers<Context>().body|params|request(...))` from
  `@owlmeans/server-entrypoint` / `@owlmeans/server-api`.
- Socket: `bind(protocol, connection(protocol, handler))`.
- Client API route: `bind(protocol)` or `bindAll(tree)` from `@owlmeans/client-entrypoint`.
- Client screen: `bindScreen(protocol, componentHandler)`.

Do not construct contextual compatibility entrypoints, look a protocol up by alias with a generic,
or replace an item in an entrypoint array. Import the declaration and bind that exact object. This
keeps declarations immutable and lets TypeScript infer requests and replies end to end.
