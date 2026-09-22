# @owlmeans/server-api

The Fastify HTTP server of an OwlMeans backend and the protocol-bound handler factories that serve
it. An application imports `handlers<Context>()` in every HTTP handler module (often through the
`@owlmeans/server-app` re-export) and `holdApiPort` for a guarded boot. The server itself —
`appendApiServer` — is already added by `@owlmeans/server-app`'s `makeContext`; call it directly
only when composing a context without that package. WebSocket routes belong to
`@owlmeans/server-socket`, and calls to other services go through the `@owlmeans/api` client.

## Installation

```bash
bun add @owlmeans/server-api@^0.1.18-rc.38
```

## Concepts

- **API server** — the `api-server` service (`context.getApiServer()`), holding a `FastifyInstance`
  and `listen()`. At context init it builds its route table from the registered entrypoints: backend
  routes of this `cfg.service` only, excluding socket and queue protocols.
- **Request pipeline** — intermediates run first; then the protocol's guards (the first guard whose
  `match` hits handles the request and sets `request.auth`, and the organization entity is attached);
  then its gates (`gate.assert`); then the handler.
- **Protocol-bound handler** — `handlers<Context>().body / .params / .request` infer the request
  sections and the response type from the declaration. A returned value resolves the entrypoint with
  `EntrypointOutcome.Ok` (HTTP 200); a thrown error rejects it.
- **Validation** — the contract's schemas are compiled with AJV (`removeAdditional`, `useDefaults`,
  `coerceTypes`), so a handler receives cleaned, coerced input.
- **Error mapping** — `AuthForbidden` / `AccessError` answer 403, `AuthorizationError` /
  `AuthFailedError` answer 401, a class declaring `static httpStatus` as an integer 4xx answers that
  status, and anything else 500 — always with the marshalled `ResilientError` as the body. A refusal
  of the caller's condition declares its status; a fault declares nothing and stays 500. The status
  is taken from the error as thrown first, and from the ensured (rebuilt) error only when that
  answers 500. An auth family is matched by class or by exact registered type name (the instance's
  `type` or a `typeName` on its constructor chain), so duplicate module copies answer the same.

## Usage

### Body, params and request handlers

```ts
import { handlers } from '@owlmeans/server-api'
import { bind } from '@owlmeans/server-entrypoint'
import { requireEntityKey } from '@owlmeans/auth-common'
import { projectProtocols } from 'my-app-common'
import type { Context } from './context.js'

const api = handlers<Context>()

// body: the validated body first, then context and the full request
const create = api.body(projectProtocols.create, async (payload, context, request) =>
  context.project().create({ ...payload, entityId: requireEntityKey(request) }))

// params: the validated URL params first
const get = api.params(projectProtocols.get, async ({ id }, context, request) =>
  context.project().load({ id, entityId: requireEntityKey(request) }))

// request: every typed section plus request metadata (auth, entity, headers)
const search = api.request(projectProtocols.search, async (request, context) =>
  context.project().list({ entityId: requireEntityKey(request), ...request.query }))

export const serverBindings = [
  bind(projectProtocols.base),
  bind(projectProtocols.create, create),
  bind(projectProtocols.get, get),
  bind(projectProtocols.search, search),
]
```

### Refusing a request

Guards and gates run before the handler; a handler still checks ownership and throws a typed error,
which the server maps onto a status.

```ts
import { AuthForbidden } from '@owlmeans/auth'

// the protocol declares both `params` and `body`
export const rename = api.body(projectProtocols.rename, async ({ name }, context, request) => {
  const entityId = requireEntityKey(request)
  const project = await context.project().load({ id: request.params.id, entityId })
  if (project == null) {
    throw new AuthForbidden('project') // 403
  }

  return context.project().update({ ...project, name })
})
```

A refusal that is not about permission declares its own 4xx on the class. The declaring package
never imports this one — the static property is read structurally and inherited by subclasses:

```ts
import { ResilientError } from '@owlmeans/error'

export class ProjectBusy extends ResilientError {
  public static override typeName = 'ProjectBusy'
  public static httpStatus = 409 // honoured only as an integer 400–499; anything else answers 500

  constructor(message: string = 'error') {
    super(ProjectBusy.typeName, `project-busy:${message}`)
  }
}
```

### File upload

`uploadedFile(request)` is the only place a handler touches the Fastify multipart API. The protocol
must declare a `body` section.

```ts
import { handlers, NoFileError, uploadedFile } from '@owlmeans/server-api'

export const upload = api.request(invoiceProtocols.attach, async (request, context) => {
  const file = await uploadedFile(request)
  if (file == null) {
    throw new NoFileError()
  }

  const content = await file.toBuffer()

  return context.attachment().create({
    entityId: requireEntityKey(request),
    name: file.filename,
    mimetype: file.mimetype,
    size: content.length,
  })
})
```

### Holding the port during boot

```ts
import { holdApiPort } from '@owlmeans/server-api'

const hold = await holdApiPort(cfg, { okPath: '/healthz' }) // 200 on /healthz, 503 elsewhere
await context.configure().init()
await hold.release()
await context.getApiServer().listen()
```

### A context without `@owlmeans/server-app`

```ts
import { makeServerContext } from '@owlmeans/server-context'
import { appendApiServer } from '@owlmeans/server-api'

const context = appendApiServer(makeServerContext(cfg))
context.registerEntrypoints(serverBindings)
await context.configure().init()

// the Fastify instance, for plugins the framework does not register
context.getApiServer().server.addHook('onResponse', async (request, reply) => {
  console.log(request.url, reply.statusCode)
})

await context.getApiServer().listen()
```

## API

### Root export

| Symbol | Kind | Purpose |
|---|---|---|
| `handlers<Context>()` | function | Factories `body(protocol, fn)`, `params(protocol, fn)`, `request(protocol, fn)` returning `BoundEntrypointHandler<Protocol>` |
| `uploadedFile(request)` | function | The multipart file of a request, or `undefined` |
| `extractUploadedFile(req)` | function | Same boundary for an untyped `AbstractRequest`; returns `Promise<UploadedFile \| undefined>` |
| `holdApiPort(cfg, opts?)` | function | Bind the service port before init; returns `ApiPortHold` with `release()` |
| `createApiServer(alias)` | function | Create the Fastify API server service |
| `appendApiServer(ctx, alias = DEFAULT_ALIAS)` | function | Register the API server and `context.getApiServer()` |
| `handleBody`, `handleParams`, `handleRequest`, `handleIntermediate` | function | Unbound compatibility wrappers returning `RefedEntrypointHandler` |
| `AuthFailedError`, `AccessError`, `NoFileError` | class | Registered `ResilientError` subclasses (401, 403, 500) |
| `DEFAULT_ALIAS` | const | `'api-server'` |
| `PORT` | const | `80`, used when the service route declares no port |
| `CLOSED_HOST`, `OPENED_HOST` | const | `'127.0.0.1'` and `'0.0.0.0'`; a service with `opened: true` listens on the second |
| `ApiServer`, `ApiServerAppend` | type | The server service and its context mixin |
| `ApiPortHold`, `ApiPortHoldOptions` | type | `holdApiPort` result and options (`okPath?`, `payload?`) |
| `Config`, `Context` | type | `ServerConfig` and `ServerContext & ApiServerAppend` |
| `Request`, `Response` | type | Fastify request and reply |
| `UploadedFile` | type | Fastify `MultipartFile` |

### `./utils` subpath

For transport packages (such as `@owlmeans/server-socket`) that reuse the HTTP pipeline; application
code does not need it.

| Symbol | Kind | Purpose |
|---|---|---|
| `authorize(context, module, req, reply)` | function | Run guards, set `auth`, call `attachEntity` |
| `createServerHandler(module, location)` | function | The Fastify handler: authorize, gates, handle, respond |
| `canServeModule(context, module)` | function | Whether an entrypoint belongs on this HTTP server |
| `provideRequest(alias, req, provision?)` | function | Build an `AbstractRequest` from a Fastify request |
| `executeResponse(response, reply, throwOnError?)` | function | Send an `AbstractResponse` onto a reply |
| `handleError(error, reply)` | function | Answer an error with `errorStatus` and the marshalled body |
| `errorStatus(error)` | function | 403 / 401 for auth errors (by class or type name), else the class's declared 4xx, else 500 |
| `declaredErrorStatus(error)` | function | The integer 4xx a class declares through `static httpStatus`, or `null` |
| `HttpStatusDeclaration` | type | `{ httpStatus?: unknown }` — the structural shape a declaring class has |
| `fixFormatDates(schema)` | function | Rewrite `date-time` object schemas as strings |
| `populateContext(req, context)`, `extractContext(req, ctx?, location?)` | function | Carry the request-scoped context on the raw request |

## Common pitfalls

- `.body` and `.params` exist only for a protocol that declares that section; for anything else use
  `.request`.
- Do not reach into `request.original` from application code — `uploadedFile(request)` is the
  multipart boundary.
- Prefer `handlers<Context>()` over the unbound `handle*` wrappers, and never hand-write a
  `RefedEntrypointHandler` for an HTTP route.
- A handler is wrapped by `handlers<Context>()` **exactly once**: wrap a plain function where it is
  bound (`bind(p, api.body(p, create))`), or bind the already-bound export directly
  (`const create = api.body(p, ...)` then `bind(p, create)`) — never both. `tsc` rejects a double
  wrap (`TS2345 "BoundEntrypointHandler<…> is not assignable"`); at runtime a handler already bound
  to the SAME protocol is returned unchanged with a one-time console warning, and anything else that
  is not a plain function fails that one route with `HandlerMisconfiguredError` instead of the
  opaque `TypeError: handler is not a function`.
- A guard only authenticates. Gates authorize, and the handler keeps its organization check keyed on
  `requireEntityKey(request)` — never an id read from the token.
- `request.entity` is absent when no entity resolver is registered; `requireEntityKey` falls back to
  the slug there, `requireEntity` throws.
- A handler always answers 200 on success. The port comes from `cfg.services[cfg.service]`
  (`internalPort ?? port ?? 80`).
- A `holdApiPort` bind failure must end the process with a non-zero exit.
- WebSocket routes use `connection(protocol, callback)` from `@owlmeans/server-socket`.

## Related packages

- [`@owlmeans/server-entrypoint`](../server-entrypoint) — `bind()` attaches handlers to protocols
- [`@owlmeans/server-app`](../server-app) — application bootstrap and re-exports
- [`@owlmeans/server-socket`](../server-socket) — the WebSocket counterpart of `handlers`
- [`@owlmeans/entrypoint`](../entrypoint) — `contract`, `typed`, request/response types
- [`@owlmeans/auth-common`](../auth-common) — `requireEntityKey`, `attachEntity`, guard aliases
- [`@owlmeans/api`](../api) — the client that calls these endpoints from other services

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.34
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
