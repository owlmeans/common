---
name: getting-started
description: Start a protocol-first OwlMeans application with shared contracts, server entrypoints and browser entrypoints.
metadata:
  scope: general
---

# Protocol-first application shape

An OwlMeans application owns one shared protocol declaration and creates local entrypoints for each
runtime. The declaration is never modified by a server or browser.

```ts
// common/src/entrypoints.ts
export const sessionProtocols = {
  list: protocol(
    route(session.list, '/session', backend()),
    contract.request({ query: typed<SessionQuery>(SessionQuerySchema) }, typed<Session[]>())
  ),
}
```

```ts
// api/src/entrypoints.ts
const api = handlers<Context>()
export const serverBindings = [
  ...frameworkEntrypoints,
  bind(sessionProtocols.list, api.request(sessionProtocols.list, listSessions)),
]
```

```ts
// web/src/entrypoints.ts
export const clientBindings = [
  ...frameworkEntrypoints,
  ...bindAll(sessionProtocols),
]

const sessions = await context.entrypoint(sessionProtocols.list).call({ query: { sid } })
```

Use `schema<T>(...)` or `typed<T>(...)` at the contract boundary. Bind all route parents with their
children. Keep organization entity values on the wire as `entitySlug`; database relations use
`entityId` only.
