---
name: getting-started
description: Start a protocol-first OwlMeans application with shared contracts, server bindings and browser bindings.
metadata:
  scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Protocol-first application shape

An OwlMeans application owns one shared protocol declaration and creates local bindings for each
runtime. The declaration is never modified by a server or browser.

```ts
// common/src/entrypoints.ts
export const sessionEntrypoints = {
  list: protocol(
    route(session.list, '/session', backend()),
    contract.request({ query: typed<SessionQuery>(SessionQuerySchema) }, typed<Session[]>())
  ),
}
```

```ts
// api/src/entrypoints.ts
const api = handlers<Context>()
export const appEntrypoints = [
  ...frameworkEntrypoints,
  bind(sessionEntrypoints.list, api.request(sessionEntrypoints.list, listSessions)),
]
```

```ts
// web/src/entrypoints.ts
export const appEntrypoints = [
  ...frameworkEntrypoints,
  ...bindAll(sessionEntrypoints),
]

const sessions = await context.entrypoint(sessionEntrypoints.list).call({ query: { sid } })
```

Use `schema<T>(...)` or `typed<T>(...)` at the contract boundary. Bind all route parents with their
children. Keep organization entity values on the wire as `entitySlug`; database relations use
`entityId` only.
