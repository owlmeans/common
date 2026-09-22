---
name: server-api
description: Implement HTTP entrypoint protocols with @owlmeans/server-api handlers<Context>().body(), params(), request(), and uploadedFile(). Load before writing an API handler.
user-invocable: false
---

# @owlmeans/server-api

**Install:** `bun add @owlmeans/server-api@^0.1.18-rc.41`

Make handlers from the protocol declaration so input and output types stay coupled to the shared
contract:

```ts
const api = handlers<AppContext>()

const create = api.body(projectProtocols.create, async (body, context, request) =>
  context.projects.create(body, request.auth)
)

const get = api.params(projectProtocols.get, async ({ id }, context) =>
  context.projects.get(id)
)

const search = api.request(projectProtocols.search, async (request, context) =>
  context.projects.search(request.query)
)

export const serverBindings = [
  bind(projectProtocols.create, create),
  bind(projectProtocols.get, get),
  bind(projectProtocols.search, search),
]
```

`body` and `params` are available only for a protocol declaring that section. `request` works for
any protocol and receives all its typed sections plus request metadata. A successful callback
return resolves the entrypoint with `EntrypointOutcome.Ok`; a thrown error rejects it.

## Wrap exactly once

A handler is wrapped by `handlers<Context>()` exactly once — either shape above (create the bound
handler and bind it directly) is correct on its own. Never combine them: a handler module that
already exports a bound handler must be bound directly, not wrapped again where it is bound.

```ts
// WRONG — bound once in the handler module, wrapped a second time here
export const create = api.body(projectProtocols.create, async (body, context) => ...)
bind(projectProtocols.create, api.body(projectProtocols.create, create))
```

`tsc` rejects the double wrap (`TS2345 "Argument of type 'BoundEntrypointHandler<…>' is not
assignable"`). At runtime, `body`/`params`/`request` return an already-bound handler for the SAME
protocol unchanged, with a one-time warning; anything else that is not a plain function fails only
that one route with `HandlerMisconfiguredError`, instead of the opaque
`TypeError: handler is not a function`.

## The status a thrown error answers

A thrown error (or a rejected response) is answered with the marshalled `ResilientError` as the
body and a status from `errorStatus(error)` (`./utils`), resolved in this order:

| Error | Status |
|---|---|
| `AuthForbidden`, `AccessError` or a subclass — by class or registered type name | 403 |
| `AuthorizationError`, `AuthFailedError` or a subclass — by class or registered type name | 401 |
| a class declaring `static httpStatus` as an integer 400–499 | that status |
| anything else, including a declaration outside 400–499 | 500 |

- **A refusal of the caller's condition declares its status; a fault declares nothing.** 400 a
  malformed request, 402 an unpaid balance or plan, 404 an addressed target that does not exist
  (or is another organization's), 409 a target whose current state conflicts, 422 content or a body
  that is understood and refused — and a missing configuration, a broken peer, a timeout or a bug
  stays 500, because monitoring, logs, proxies and retry logic read a 5xx as the server failing.
  The table and the leaf-class rule are the `error` skill's.
- Declare it on the class: `public static httpStatus = 409` (`override` only when an ancestor
  already declares one). The declaration is structural — the package declaring an error never
  imports `@owlmeans/server-api` — and a static property is inherited, so a subclass answers its
  nearest declaring ancestor's status and redeclares to change it.
- The auth branches win over a declaration, in that order (`AuthForbidden extends
  AuthorizationError`, so 403 is tested first). An entitlement or permission refusal extends
  `AuthForbidden` rather than declaring 403.
- `handleError` resolves the status on the error AS THROWN first, and asks the ENSURED
  (`ResilientError.ensure`) error only when that answers 500. The thrown object is the one whose
  class is certainly what was raised; the rebuild is what gives a status to a marshalled error that
  crossed a hop as a plain `Error`. `ensure` returns an error from any `@owlmeans/error` copy
  untouched, so the body keeps the thrown class's `type` (`AuthFailedError|||api:auth:…`) even in a
  process holding duplicate module copies (`bun --preserve-symlinks`). `executeResponse` ensures
  nothing and answers the rejected error's status. `@owlmeans/server-socket` answers an upgrade
  through the same `handleError`.
- An auth family is recognised by `instanceof` OR by an exact registered type name — the instance's
  `type` or any static `typeName` on its constructor chain — so a class from another module copy
  answers the same status. Match whole names, never substrings: a subclass's `typeName` does not
  reliably embed its parent's (`EntitlementRefusal` extends `AuthForbidden`). A declared
  `httpStatus` is a structural static read and survives duplicate copies as it is.
- The status never changes what a client rebuilds: `@owlmeans/api` rehydrates the class from the
  body for any non-2xx answer, so a caller branches on the class, never on the number. Nothing in
  the framework treats a 404 specially — a missing route is a Fastify JSON body the client turns
  into `ApiClientError('404')`, a refusal is a marshalled string rebuilt as its class.

`uploadedFile(request)` is the Fastify multipart boundary. Keep raw Fastify access there rather
than reaching through `request.original` in application code.

## Error exposure

`handleError` always assigns an incident UUID, attaches it to the logged error and returns it in the
`X-Incident-ID` response header (exposed through CORS). A production response body contains only
that id; an explicit `cfg.http.errors.exposure = 'development'` uses the typed marshalled form with
message and stack. Keep the default production-safe, and tell a client to report the incident id.

Do not use unbound compatibility handler wrappers. For a WebSocket route use
`@owlmeans/server-socket`'s `connection(protocol, callback)`.
