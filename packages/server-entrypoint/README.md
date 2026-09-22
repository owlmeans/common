# @owlmeans/server-entrypoint

Server-side entrypoint binding: turns an immutable protocol declaration from the shared package into
a server-local entrypoint that carries its route, guards, gate and handler. An application calls
`bind` / `bindAll` in its `entrypoints.ts` (often through the `@owlmeans/server-app` re-export) to
build the list it registers on the context. It does not write handlers — use `handlers<Context>()`
from `@owlmeans/server-api` for HTTP and `connection()` from `@owlmeans/server-socket` for sockets —
and a browser app binds the same protocols with `@owlmeans/client-entrypoint` instead.

## Installation

```bash
bun add @owlmeans/server-entrypoint@^0.1.18-rc.30
```

## Concepts

- **Protocol declaration** — the frozen `protocol()` / `openProtocol()` object from
  `@owlmeans/entrypoint`, shared by callers and servers. It is data; binding never changes it.
- **Server entrypoint** — what `bind` returns: a materialized copy with a server route, merged
  guards, gate, filter, optional fixer and handler, plus a `protocol` field pointing at its
  declaration.
- **Bound handler** — `{ protocol, bind }`, produced by `handlers<Context>()` or `connection()`. It
  is inseparable from the protocol whose request it accepts.
- **Group node** — a parent declaration (`base`) bound without a handler. It contributes the path
  prefix, guards and gate its children inherit and is never mounted as a route itself.
- **Intermediate** — an entrypoint whose handler runs before matching routes and may replace the
  request context; declared per route or forced with `{ intermediate: true }`.

## Usage

### Bind leaves and their parents

```ts
import { bind } from '@owlmeans/server-entrypoint'
import { handlers } from '@owlmeans/server-api'
import { projectProtocols } from 'my-app-common'
import type { Context } from './context.js'

const api = handlers<Context>()

export const serverBindings = [
  bind(projectProtocols.base),
  bind(projectProtocols.create, api.body(projectProtocols.create, async (body, context) =>
    context.project().create(body))),
  bind(projectProtocols.get, api.params(projectProtocols.get, async ({ id }, context) =>
    context.project().load(id))),
]
```

### Bind a flat collection

`bindAll` pairs each declaration with the implementation whose `protocol` is the same object.
Declarations without an implementation are bound as group nodes. Flatten a tree with `protocols()`
only here, at the registration boundary.

```ts
import { bindAll } from '@owlmeans/server-entrypoint'
import { protocols } from '@owlmeans/entrypoint'
import * as project from './app/project.js'

export const projectBindings = bindAll(protocols(projectProtocols), [
  project.list,
  project.create,
  project.get,
])
```

### Bind a tree by path

Larger services walk the protocol tree and look up the implementation at the same path, so a new or
renamed declaration stays type-checked at its binding site:

```ts
import { bind } from '@owlmeans/server-entrypoint'
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
import { isEntrypointProtocol } from '@owlmeans/entrypoint'
import type { EntrypointTree } from '@owlmeans/entrypoint'

type Implementations = Record<string, unknown>

const bindTree = (tree: EntrypointTree, implementations: Implementations = {}): ServerEntrypoint<object>[] =>
  Object.entries(tree).flatMap(([key, declaration]) => {
    const implementation = implementations[key]
    if (isEntrypointProtocol(declaration)) {
      return [bind(declaration, implementation as never)]
    }
    return bindTree(declaration, (implementation ?? {}) as Implementations)
  })

export const serverBindings = bindTree({ project: projectProtocols, invoice: invoiceProtocols }, {
  project: { list: project.list, create: project.create, get: project.get },
  invoice: { list: invoice.list, pay: invoice.pay },
})
```

### Server-local options

The third argument adjusts only the local binding. `guards` are merged with the declaration's,
`fixer` names a `FixerService` that answers errors instead of the default mapping, and
`intermediate` forces the entrypoint to run as an intermediate.

```ts
import { bind } from '@owlmeans/server-entrypoint'

export const serverBindings = [
  bind(sessionProtocols.base, undefined, { intermediate: true }),
  bind(invoiceProtocols.download, invoice.download, { fixer: MY_APP_DOWNLOAD_FIXER }),
]
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `bind(protocol, implementation?, options?)` | function | Materialize one declaration and attach a bound handler (or a `RefedEntrypointHandler`); returns `ServerProtocolEntrypoint<Protocol>` |
| `bindAll(declarations, implementations = [])` | function | Bind a flat declaration list, pairing implementations by `implementation.protocol === declaration` |
| `ServerEntrypoint<R>` | type | `CommonEntrypoint` with `route: ServerRouteModel<R>`, `handle: EntrypointHandler`, `fixer?` |
| `ServerProtocolEntrypoint<Protocol>` | type | `ServerEntrypoint<object>` plus `readonly protocol` |
| `BoundEntrypointHandler<Protocol>` | type | `{ readonly protocol, bind: RefedEntrypointHandler }` |
| `RefedEntrypointHandler<R>` | type | `(ref: EntrypointRef<R>) => EntrypointHandler`; the handler reads the bound entrypoint (and its context) from `ref.ref` |
| `EntrypointRef<R>` | type | `{ ref?: ServerEntrypoint<R> }` |
| `EntrypointOptions<R>` | type | `CommonEntrypointOptions` plus `fixer?`, `intermediate?`, `routeOptions?` |
| `FixerService` | type | Service with `handle(reply, error)` used when a binding names a `fixer` |

## Common pitfalls

- A handler carries its `protocol`, and collections match by object identity. Never attach, find or
  replace a handler by alias.
- A decorated tree (`withOidcGuard(tree)`, `decorateEntrypoint(...)`) consists of new objects. Make
  handlers from the same decorated protocols you bind, or `bindAll` will not pair them.
- Do not mutate a declaration or create a mutable contextual declaration; decorate the tree before
  binding instead.
- Bind parent declarations too. A route whose parent is not registered loses its inherited path,
  guards and gate.
- A binding without a handler is never mounted as an HTTP route — that is how group nodes work, and
  also why a forgotten implementation shows up as a 404.
- HTTP handlers come from `handlers<Context>()`; socket handlers from `connection(protocol, callback)`.

## Related packages

- [`@owlmeans/entrypoint`](../entrypoint) — immutable protocol declarations
- [`@owlmeans/server-api`](../server-api) — `handlers<Context>()` for HTTP bindings
- [`@owlmeans/server-socket`](../server-socket) — `connection()` for socket bindings
- [`@owlmeans/server-route`](../server-route) — the server route model a binding carries
- [`@owlmeans/server-app`](../server-app) — re-exports `bind` / `bindAll` and registers the list
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — the browser-side binding of the same protocols

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
