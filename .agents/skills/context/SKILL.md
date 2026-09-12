---
name: context
description: Use OwlMeans context services, resources and typed entrypoint protocol references.
---

# Context lookups

**Install:** `bun add @owlmeans/context@^0.1.18-rc.14`

Use a protocol declaration directly when obtaining an entrypoint. The declaration supplies the
registered entrypoint’s request and response types.

```ts
const project = await context.entrypoint(projectEntrypoints.get).call({
  params: { id },
})
```

Use `context.service(alias)` for registered services and context resource APIs for data access.
Protocol declarations are shared immutable values; context registration receives local server or
client entrypoints created with `bind()`, `bindAll()` or `bindScreen()`.

Keep organization entity addressing on the wire as `entitySlug`. Resolve the stable `entityId`
inside the context before persisting relations or calling third parties.
