# @owlmeans/client-entrypoint

Client-side binding of shared entrypoint protocols. It turns an immutable `@owlmeans/entrypoint`
declaration into a context entrypoint with three verbs: `call()`, `invoke()` and `url()`. Every
browser and native OwlMeans app uses it, usually through the `bind` / `bindAll` / `bindScreen`
re-exports of `@owlmeans/web-client` or `@owlmeans/web-panel`. Protocols are declared with
[`@owlmeans/entrypoint`](../entrypoint), never here. Server handlers are bound with
[`@owlmeans/server-entrypoint`](../server-entrypoint).

## Installation

```bash
bun add @owlmeans/client-entrypoint@^0.1.18-rc.37
```

## Concepts

- **Protocol** — the shared, immutable declaration of one route, its typed request sections, its
  response, guards and gate. Binding never mutates it, and `context.entrypoint(protocol)` derives
  the request and reply types from it.
- **Binding** — `bind`, `bindAll` and `bindScreen` materialize protocols into
  `ClientProtocolEntrypoint<Protocol>` values, which the app hands to `context.registerEntrypoints`.
- **Screen** — a binding that carries a renderer. It is addressed by `url()`; `call()` and
  `invoke()` throw and point the caller at `url()`.
- **Verbs** — `call()` resolves to the value and throws the reply's error; `invoke()` resolves to
  `{ value, outcome }`; `url()` builds the address with `:params` filled in and the query appended.
- **Transport selection** — the route's protocol decides the carrier. When a service is registered
  under that protocol's transport alias (a socket or queue transport), it takes the call. Otherwise
  the API client named by `cfg.webService` does — a string, or a map keyed by service name with a
  default key. Callers never branch on it.
- **Call options** — a request holds only the contract's sections (`params`, `query`, `body`,
  `headers`) plus `CallOptions`: `auth`, `host`, `base`, `unsecure`, `timeout` and `signal`.

## Usage

### 1. Bind a protocol tree and screens

```ts
import { handler } from '@owlmeans/client'
import { bind, bindAll, bindScreen, stab } from '@owlmeans/client-entrypoint'
import { apiProtocols, webProtocols } from 'my-app-common'
import { ProjectListScreen } from './screens/project-list.js'

export const clientBindings = [
  // Every API declaration the browser may call, route parents included.
  ...bindAll(apiProtocols),
  // A backend route outside that tree.
  bind(apiProtocols.health),
  bindScreen(webProtocols.projectList, handler(ProjectListScreen)),
  // A frontend route only ever addressed by URL, with no component of its own here.
  bindScreen(webProtocols.projectExport, stab),
]

context.registerEntrypoints(clientBindings)
```

### 2. Per-binding options

`bind` and `bindScreen` take `ClientEntrypointOptions`. Use `bind` instead of `bindAll` when one
protocol needs something the rest do not.

```ts
import { authProtocols } from '@owlmeans/auth-common'
import { bind, bindScreen, stab } from '@owlmeans/client-entrypoint'
import { apiProtocols, MY_APP_WEB } from 'my-app-common'

export const extraBindings = [
  // Validate the request against the protocol's schemas before it leaves the browser.
  bind(apiProtocols.project.create, { validateOnCall: true }),
  // Pin a frontend route to an explicitly selected service.
  bindScreen(authProtocols.flowEnter, stab, { routeOptions: { overrides: { service: MY_APP_WEB } } }),
]
```

### 3. Call, invoke, url

```ts
import { EntrypointOutcome } from '@owlmeans/entrypoint'

const create = ctx.entrypoint(apiProtocols.project.create)

// Value only. The body type comes from the shared contract; do not add a generic here.
const project = await create.call({ body: { name: form.name } })

// Value and outcome, when the outcome decides the next step.
const { value, outcome } = await ctx.entrypoint(apiProtocols.project.get).invoke({ params: { id } })
if (outcome !== EntrypointOutcome.Ok) {
  throw new ProjectMissing(id)
}

// A screen address; absolute when the route belongs to another service or when asked for.
const href = await ctx.entrypoint(webProtocols.project).url({ params: { id: value.id } }, { absolute: true })
```

### 4. Timeouts and cancellation

```ts
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 15_000)

try {
  const files = await ctx.entrypoint(apiProtocols.files.list).call({
    params: { id: projectId },
    query: { path: '/' },
    timeout: 10_000,
    signal: controller.signal,
  })
  showFiles(files)
} finally {
  clearTimeout(timer)
}
```

A mutation route (`POST`, `PUT`, `PATCH`) always sends a body — `{}` when the contract has none —
so `call({ params })` is enough. Never add `{ body: {} }` as a workaround.

### 5. Narrowing a payload to a schema

`pickPerSchema(object, schema)` keeps only the keys the AJV schema declares and skips `null` values.
It is useful when a form model carries more fields than the contract accepts.

```ts
import { pickPerSchema } from '@owlmeans/client-entrypoint'
import type { ProjectUpdate } from 'my-app-common'
import { ProjectUpdateSchema } from 'my-app-common'

const body = pickPerSchema<typeof formValues, ProjectUpdate>(formValues, ProjectUpdateSchema)
await ctx.entrypoint(apiProtocols.project.update).call({ params: { id }, body })
```

## API

### `@owlmeans/client-entrypoint`

| Symbol | Kind | Purpose |
|---|---|---|
| `bind(protocol, options?)` | function | Materialize one protocol for a client context |
| `bindAll(tree)` | function | Materialize every protocol in a named declaration tree |
| `bindScreen(protocol, handler, options?)` | function | Materialize a frontend protocol with its renderer |
| `stab` | const | No-op `RefedEntrypointHandler` for a URL-only frontend binding |
| `provideRequest(alias, path)` | function | A minimal `AbstractRequest` for a dynamic boundary (for example a socket request) |
| `pickPerSchema(object, schema)` | function | Keep only the non-null keys an AJV schema declares |
| `ClientProtocolEntrypoint<Protocol>` | type | The bound view of a protocol — see *Entrypoint members* |
| `ClientEntrypoint<T, R>` | type | The untyped bound entrypoint shape the protocol view is built from |
| `ClientEntrypointOptions` | type | `routeOptions?` (`ClientRouteOptions`), `validateOnCall?`, plus common entrypoint options |
| `ClientRequest` | type | `AbstractRequest` as the client sends it |
| `EntrypointCall`, `EntrypointInvoke`, `EntrypointReply`, `EntrypointUrl`, `EntrypointUrlOptions`, `EntrypointFilter` | type | Verb signatures; `EntrypointReply` is `{ value, outcome }`, `EntrypointUrlOptions` is `{ absolute? }` |
| `EntrypointRef`, `RefedEntrypointHandler` | type | The handler-factory contract `bindScreen` and `stab` use |
| `ClientEntrypointError` | class | Base client entrypoint error |
| `ClientValidationError` | class | Thrown by `validate()` when a request does not match its schema |

### Entrypoint members

| Member | Purpose |
|---|---|
| `call(request?)` | Round trip; resolves to the value and throws the reply's error |
| `invoke(request?)` | Same round trip; resolves to `{ value, outcome }` |
| `url(request?, { absolute? })` | The address, with `:params` filled and the query appended |
| `validate(request?)` | Check the request against the protocol's filter schemas |
| `segment()`, `path()`, `mount()` | This route's segment, the segment under its ancestors, and that path under the service base — computed on every call, never written back |
| `protocol` | The declaration the binding was made from |

### `@owlmeans/client-entrypoint/utils`

| Symbol | Kind | Purpose |
|---|---|---|
| `apiInvoke(ref, options?)` | function | The round trip behind `invoke()` |
| `apiHandler(ref)` | function | The handler that picks the transport service or the API client |
| `entrypointUrl(ref, request?, options?)` | function | The address behind `url()` |
| `validate(ref)` | function | The filter behind `validate()` |
| `isEntrypoint(value)` | function | Re-export from `@owlmeans/entrypoint/utils` |

## Common pitfalls

- **Pass protocol objects, never alias strings.** `context.entrypoint(protocol)` is the lookup;
  `entrypointRef<Request, Response>(alias)` from `@owlmeans/entrypoint` is reserved for a dynamic
  remote declaration that cannot be imported.
- **Do not add a result generic at the call site.** When a type is wrong, fix the shared contract.
- **Bind route parents too.** An unbound protocol throws "entrypoint not found" before the request
  is sent, which a broad `catch` easily misreports as a server error.
- **Screens reject `call()` and `invoke()`.** Use `url()` or navigate to them.
- **`cfg.webService` must resolve.** A context whose `webService` names no client for the route's
  service (and no default key) throws a `SyntaxError` on the first call.
- **Socket URLs are always absolute.** A relative value would resolve against the page origin, which
  in a split deployment is the web host rather than the service answering the upgrade.
- **Never mutate a declaration or a shared declaration collection** to change a guard, gate or
  service. Use binding options, or derive an immutable decoration in the shared package.

## Related packages

- [`@owlmeans/entrypoint`](../entrypoint) — `protocol()`, `contract()`, `typed()` and protocol trees
- [`@owlmeans/client`](../client) — `handler`, `useNavigate`, `useEntrypoint`
- [`@owlmeans/client-route`](../client-route) — client route models and `ClientRouteOptions`
- [`@owlmeans/api`](../api) — the HTTP client that carries calls
- [`@owlmeans/client-socket`](../client-socket) — socket transport for socket protocols
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — the server-side counterpart
- [`@owlmeans/web-client`](../web-client) — re-exports the binding helpers for browser apps

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.37
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
