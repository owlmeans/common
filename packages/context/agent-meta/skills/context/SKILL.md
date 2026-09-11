---
name: context
description: Use OwlMeans context services, resources and typed entrypoint protocol references.
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Context lookups

Use a protocol declaration directly when obtaining an entrypoint. The declaration supplies the
registered entrypoint’s request and response types.

```ts
const project = await context.entrypoint(projectEntrypoints.get).call({
  params: { id },
})
```

Use `context.service(alias)` for registered services and context resource APIs for data access.
Protocol declarations are shared immutable values; context registration receives local server or
client bindings created with `bind()`, `bindAll()` or `bindScreen()`.

Keep organization entity addressing on the wire as `entitySlug`. Resolve the stable `entityId`
inside the context before persisting relations or calling third parties.
