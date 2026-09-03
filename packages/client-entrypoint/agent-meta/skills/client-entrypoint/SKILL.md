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
| `provideRequest(alias, path)` / `pickPerSchema(obj, schema)` | Request construction helpers |
| `ClientEntrypointError` / `ClientValidationError` | Typed client-side failures |

## Subpath Exports

- `./utils` — `entrypointUrl(ref, req?, opts?)`, `apiInvoke(ref, opts?)`, `apiHandler(ref)`, `validate(ref)`

## Usage

Most app code uses `elevate()` from `@owlmeans/web-client` (which builds on this). Use this directly only for cross-platform entrypoint helpers.

```typescript
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
```

Client-side callability is an **explicit opt-in**: a declaration only becomes callable from a client
once a bare client `elevate` (or `celevate` on the server side) has been applied to it. Elevating is
idempotent, and guards passed at elevation are added to the ones the declaration already carries.

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
`./utils`, which packages building their own addressing (sockets, for instance) call directly.

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/client-route`, `@owlmeans/client-context`
- `@owlmeans/api` (the HTTP carrier), `@owlmeans/config` (`makeSecurityHelper` for absolute URLs)
