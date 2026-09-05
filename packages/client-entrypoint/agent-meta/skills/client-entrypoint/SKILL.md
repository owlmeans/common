---
name: client-entrypoint
description: How to use @owlmeans/client-entrypoint — client-side entrypoints extending @owlmeans/entrypoint with the call/invoke/url verbs, React component attachment and elevation. Auto-invoked when importing client entrypoint helpers.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-entrypoint

**Layer:** Client
**Install:** `"@owlmeans/client-entrypoint": "^0.1.18-rc.13"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ClientEntrypoint<T, R>` | Client entrypoint interface — `call`, `invoke`, `url`, `validate`, `request` |
| `entrypoint(arg, handler?, opts?)` | Build a client entrypoint from a route model or an existing declaration |
| `elevate(entrypoints, alias, handler?, opts?)` | Make a declared entrypoint client-callable, optionally attaching a screen |
| `EntrypointCall` / `EntrypointInvoke` / `EntrypointUrl` | The typed signatures of the three verbs |
| `EntrypointReply<T>` | `{ value, outcome }` — what `invoke` resolves to |
| `EntrypointRef` / `RefedEntrypointHandler` | Handler reference pattern |
| `ClientEntrypointOptions` | What `entrypoint`/`elevate` accept — `guards`, `filter`, `gate`, `gateParams`, `routeOptions`, `validateOnCall` |
| `ClientRequest<T>` / `EntrypointFilter` / `EntrypointUrlOptions` | The request shape, the validator signature, and `{ absolute }` |
| `provideRequest(alias, path)` / `pickPerSchema(obj, schema)` | Request construction helpers |
| `stab` | A handler that renders nothing — for an entrypoint that exists only to be addressed |
| `ClientEntrypointError` / `ClientValidationError` | Typed client-side failures |

## Subpath Exports

- `./utils` — `entrypointUrl(ref, req?, opts?)`, `apiInvoke(ref, opts?)`, `apiHandler(ref)`,
  `validate(ref)`, `normalizeHelperParams(handler?, opts?)`, and the re-exported
  `makeBasicEntrypoint` / `isEntrypoint`

## Usage

Most app code uses `elevate()` from `@owlmeans/web-client` (which builds on this). Use this directly only for cross-platform entrypoint helpers.

```typescript
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
```

Client-side callability is an **explicit opt-in**: a declaration only becomes callable from a client
once a bare client `elevate` (or `celevate` on the server side) has been applied to it. Elevating is
idempotent, and guards passed at elevation are added to the ones the declaration already carries;
`filter`, `gate` and `gateParams` passed at elevation replace what was declared. An alias no
entrypoint in the list carries throws `SyntaxError`.

Both `entrypoint()` and `elevate()` accept the options in the handler slot when there is no handler,
and a bare boolean where the options go means `{ validateOnCall }`. With `validateOnCall`, every call is
checked against the declaration's `filter` (ajv, with formats) before it leaves, and a mismatch
throws `ClientValidationError` naming the offending path. A **backend** entrypoint given a handler
throws `SyntaxError` — a backend alias is opted in by elevating it with nothing.

## The three verbs

```typescript
const ep = context.entrypoint<ClientEntrypoint<Project>>(manager.back.project.create)

const project = await ep.call({ body })                  // the VALUE; the reply error is thrown
const { value, outcome } = await ep.invoke({ body })     // value AND outcome
```

`call` is the default — it resolves to the value and throws whatever the reply carried, so a caller
that only needs the result never inspects an outcome. Reach for `invoke` only where the outcome
(`Ok`, `Accepted`, `Created`, `Finished`) decides what happens next.

An entrypoint that carries a **renderer IS a screen**: it is addressed by URL, never called over the
wire, and it throws from `call()`/`invoke()` saying so.

## URL generation

`url()` fills in `:params`, appends the query, and returns a **relative** path when the route belongs
to the asking service — addressing an in-app target absolutely would turn navigation into a full page
load. Ask for `{ absolute: true }` when the URL leaves the app (redirect URIs, webhook callbacks,
anything pasted into another system), and a cross-service route is absolute regardless.

```typescript
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { HOME } from '@owlmeans/context'

const url = await context.entrypoint<ClientEntrypoint<string>>(HOME).url({}, { absolute: true })
// Returns e.g. "https://app.example.com/"
```

This is the preferred pattern for redirect URIs and navigation targets instead of manual
`window.location` concatenation. The underlying helper is `entrypointUrl(ref, req?, opts?)` from
`./utils`, which packages building their own addressing call directly.

Two cases are absolute whatever the caller asks for. A route that resolves to **another service** is
one — an in-app target addressed absolutely would turn navigation into a full page load, and a
foreign one addressed relatively would hit this app. A **socket** route is the other: `new
WebSocket(path)` resolves a relative value against the page's origin, which in a split deployment is
the web host rather than the service that answers the upgrade.

## Which carrier takes the call

`apiHandler` checks `cfg.webService` **before** it looks at anything else and throws
`SyntaxError('No webService provided')` when the field is absent. That check is unconditional, so
every client entrypoint needs an API client configured — including one that is carried by a queue
and never touches an API client at all.

Past that check the route's protocol decides. When a service is registered under that protocol's
transport alias, it takes the call, so a queue-carried entrypoint and an HTTP-carried one are the
same `call(...)` at the call site.

Otherwise the carrier is the API client `cfg.webService` names. A string names one for everything; a
record is looked up by the alias of the service the route resolves to, then by `DEFAULT_KEY`, and a
record carrying neither throws ``SyntaxError("Can't cast web service alias for <alias> entrypoint")``
— read that as "this config names API clients, but none of them for this target service". See
[[client-config]] for the field itself.

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/client-route`, `@owlmeans/client-context`,
  `@owlmeans/client-config` (`webService` resolution), `@owlmeans/route`, `@owlmeans/context`,
  `@owlmeans/error`
- `@owlmeans/api` (the HTTP carrier), `@owlmeans/config` (`makeSecurityHelper` for absolute URLs)
- `qs` (query serialization), `ajv-formats`; `ajv` is a peer dependency

## Related

- [[client]] — the React layer that navigates through `url()` and renders elevated screens
- [[client-config]] — `webService`, which decides the carrier
