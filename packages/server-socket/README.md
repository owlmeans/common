# @owlmeans/server-socket

The server WebSocket carrier for OwlMeans backends: binds socket protocol declarations to connection
handlers on the Fastify API server. An application uses `connection(protocol, callback)` for push
and streaming channels — live notifications, file or job progress, RPC over one long-lived
connection. `@owlmeans/server-app`'s `makeContext` already registers the socket service and its
middleware. Request/response HTTP routes use `handlers<Context>()` from `@owlmeans/server-api`, the
browser side is `@owlmeans/client-socket`, and background work that must survive a restart belongs
in a queue (`@owlmeans/server-job`).

## Installation

```bash
bun add @owlmeans/server-socket@^0.1.18-rc.44
```

## Concepts

- **Socket protocol** — a declaration whose route is built with `socket()` from `@owlmeans/route`.
  The HTTP server skips it; the socket service mounts it as a `GET` WebSocket route.
- **Connection** — the `@owlmeans/socket` `Connection` model. This package assigns its `send`,
  `close`, `authenticate` and `prepare`; the handler uses `notify`, `listen`, `observe`, `perform`,
  `call` and `close`.
- **Upgrade-time guards** — the protocol's guards and gates run before the upgrade with the same
  pipeline as HTTP, including organization-entity resolution, so a guarded socket arrives with
  `request.auth` and `request.entity` set.
- **In-band authentication** — a socket that receives its token after the connection is open
  assigns `conn.authenticate`; that code path establishes authentication and must resolve the entity
  itself.
- **System frames** — on close, listeners receive `{ type: MessageType.System, event: 'close',
  payload: { code } }`. A thrown callback closes the socket with code 1011; server shutdown closes
  open sockets with 1001.

## Usage

### Declare and bind

```ts
// my-app-common
import { contract, protocol, typed } from '@owlmeans/entrypoint'
import { route, socket } from '@owlmeans/route'

export const projectProtocols = {
  // ...base, list, create
  events: protocol(
    route('my-app:api:project:events', '/:id/events', socket({ parent: projectBase })),
    contract.request({ params: typed<ProjectParams>(ProjectParamsSchema) }, typed<void>()),
  ),
}
```

```ts
// my-app-api
import { bind } from '@owlmeans/server-app'
import { connection } from '@owlmeans/server-socket'
import { projectProtocols } from 'my-app-common'
import type { Context } from './context.js'

const events = connection<typeof projectProtocols.events, Context>(projectProtocols.events,
  async (conn, context, request) => {
    await conn.notify('project:ready', { id: request.params.id })
  })

export const appEntrypoints = [
  bind(projectProtocols.events, events),
]
```

### Push organization-scoped events and clean up

The parent declares `guards`, so authentication and the entity are resolved before the upgrade.

```ts
import { requireEntityKey } from '@owlmeans/auth-common'
import { MessageType } from '@owlmeans/socket'
import type { EventMessage } from '@owlmeans/socket'

export const events = connection<typeof projectProtocols.events, Context>(projectProtocols.events,
  async (conn, context, request) => {
    const entityId = requireEntityKey(request)

    // app-local pub/sub resource, one channel per organization
    const unsubscribe = await context.projectEvents().subscribe(async event => {
      if (event.projectId === request.params.id) {
        await conn.notify('project:event', event)
      }
    }, { channel: entityId })

    conn.listen(async raw => {
      if (typeof raw !== 'object') return
      const message = raw as EventMessage<void>
      if (message.type === MessageType.System && message.event === 'close') {
        await unsubscribe()
      }
    })
  })
```

### Authenticate in-band

When the client cannot send a bearer on the upgrade request, it sends the token as the first auth
frame. The handler runs the guard itself and must call `attachEntity`.

```ts
import { AUTH_HEADER, AuthenFailed, AuthenticationStage, AuthUnknown } from '@owlmeans/auth'
import type { Auth, AuthToken } from '@owlmeans/auth'
import { attachEntity, DEFAULT_GUARD, requireEntityKey } from '@owlmeans/auth-common'
import { provideResponse } from '@owlmeans/entrypoint'
import type { AbstractResponse, GuardService } from '@owlmeans/entrypoint'
import type { AuthenticateMethod } from '@owlmeans/socket'

export const watch = connection<typeof projectProtocols.watch, Context>(projectProtocols.watch,
  async (conn, context, request) => {
    const timeout = setTimeout(() => void conn.close(), 5_000)

    conn.authenticate = (async (stage: AuthenticationStage, token: AuthToken) => {
      if (stage !== AuthenticationStage.Authenticate) {
        throw new AuthUnknown('stage')
      }

      request.headers[AUTH_HEADER] ??= token.token
      const response: AbstractResponse<Auth> = provideResponse({ header: () => void 0 })
      const guard = context.service<GuardService>(DEFAULT_GUARD)
      if (!await guard.handle(request, response) || response.value == null) {
        throw new AuthenFailed('guard')
      }

      request.auth = response.value
      // This path establishes authentication, so it resolves the organization entity itself.
      await attachEntity(context, request)
      clearTimeout(timeout)

      await startWatching(conn, context, requireEntityKey(request))

      return [AuthenticationStage.Authenticated, true]
    }) as AuthenticateMethod
  })
```

### RPC over a connection

```ts
export const terminal = connection<typeof projectProtocols.terminal, Context>(projectProtocols.terminal,
  async (conn, context, request) => {
    const entityId = requireEntityKey(request)

    conn.perform('project:rename', async (id: string, name: string) => {
      const project = await context.project().load({ id, entityId })
      return project == null ? null : context.project().update({ ...project, name })
    })
  })
```

The browser side calls it with `conn.call('project:rename', id, name)` on a
`@owlmeans/client-socket` connection.

### A context without `@owlmeans/server-app`

```ts
import { appendApiServer } from '@owlmeans/server-api'
import { appendSocketService, createSocketMiddleware } from '@owlmeans/server-socket'

appendApiServer(context)
appendSocketService(context)
context.registerMiddleware(createSocketMiddleware())
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `connection<Protocol, SocketContext, SocketConnection>(protocol, handler)` | function | Bind a socket protocol to `(connection, context, request, response) => Promise<void>`; returns `BoundEntrypointHandler<Protocol>` |
| `handleConnection(handler)` | function | Unbound compatibility wrapper returning a `RefedEntrypointHandler` |
| `appendSocketService(ctx, alias = DEFAULT_ALIAS)` | function | Register the socket service on a context that already has the API server |
| `createSocketService(alias?)` | function | Create the socket service; `update(apiServer)` registers `@fastify/websocket` and the socket routes |
| `createSocketMiddleware(web = 'api-server', socket = DEFAULT_ALIAS)` | function | Loading-stage context middleware that attaches the socket service to the API server once |
| `DEFAULT_ALIAS` | const | `'socket-server'` |
| `SocketService` | type | `InitializedService` with `update(api: ApiServer)` |
| `Config`, `Context` | type | `ServerConfig` and `ServerContext & ApiServerAppend` |

## Common pitfalls

- Declare the route with `socket()`; without it the declaration is mounted as a plain HTTP `GET`.
- Bind with the same protocol object on both sides: `bind(p, connection(p, callback))`.
- Guards and gates are inherited from the protocol tree and enforced before the handler runs; do not
  re-implement them inside the callback.
- A socket that authenticates on its own must call `attachEntity(context, request)`, or
  `request.entity` stays empty and entity-keyed lookups silently find nothing.
- The token query parameter is used only to stamp `sender` / `recipient` on frames. It is not
  verified — never treat it as authentication.
- Release subscriptions and watchers on the System `close` frame. Listeners also receive heartbeat
  frames, so check `type` and `event` before acting.
- Do not expose Fastify request or socket objects through a shared contract.

## Related packages

- [`@owlmeans/socket`](../socket) — `Connection`, `MessageType`, `EventMessage`
- [`@owlmeans/client-socket`](../client-socket) — the browser and native carrier
- [`@owlmeans/server-api`](../server-api) — the API server this service attaches to
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — `bind()`
- [`@owlmeans/server-app`](../server-app) — calls `appendSocketService` in `makeContext`
- [`@owlmeans/auth-common`](../auth-common) — `attachEntity`, `requireEntityKey`, `DEFAULT_GUARD`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.38
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
