---
node: context
scope: "packages/context/**, packages/client-context/**, packages/server-context/**"
updated: 2026-09
---

# Context (container + lifecycle)

The context is the DI container every OwlMeans package extends. Registered entrypoints are the
subject of [[entrypoints]]; root `tree.md` maps the package layers that stack their factories.

## Facts

- The container holds three **flat** registries keyed by alias — services, resources, entrypoints
  ([[entrypoints]]) — plus middlewares keyed by type+stage. Nothing else addresses a registration.
- Registering an alias twice **replaces** the earlier entry. Entrypoint and service lists are
  routinely spread together, so the **last** declaration of an alias is the one that resolves.
- Lookup failures throw `SyntaxError` with exact texts: `Service <alias> not found`,
  `Service <alias> is not initialized`, `Entrypoint <alias> not found`,
  `Resource <alias> not found`.
- `init()` order: config middlewares → services awaited in insertion order → config-loading
  middlewares → resources awaited in insertion order → context-loading middlewares → stage `Ready`
  (`cfg.ready = true`, `waitForInitialized()` resolves). Ready middlewares then fire **without
  being awaited**.
- Per service, `init()` awaits `service.init()` when there is one, and marks a service with neither
  `init` nor `lazyInit` initialized. A `lazyInit`-only service is initialized on its first
  `service()` lookup; a service that is neither initialized nor lazy throws on lookup.

## Invariants

- **One context per process, built by one factory.** A layer/app factory calls the factory below
  it, applies idempotent `append*(context)` mixins, and returns the context:

  ```ts
  export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
    const context = makeServerContext<C, T>(cfg)
    appendMyService<C, T>(context)
    return context
  }
  ```

- Nothing is stored for re-creation and no factory is registered on the context. There is no child
  or derived context, no context switching, and no rebuilding a registration against another
  context — a service, resource or entrypoint binds to exactly one context for its lifetime.

## Gotchas

- The lookup texts above are quoted verbatim by viable-agent's prompt catalogue
  (`packages/common/src/skills/catalogue.ts`), by its library helpers and by its tests. Changing
  one word is a **cross-repo** change — grep viable-agent before touching them.
- `init()` never runs a `lazyInit`, and the first `service(alias)` returns before that `lazyInit`
  settles — so `waitForInitialized()` is no guarantee a lazy service is warm. A caller that needs
  it warm must await the service's own readiness.

## Pointers

- Skills: `context`, `server-context`, `client-context`. Layer: `tree.md` §2 (core foundations) —
  `context` has no `@owlmeans/*` deps and everything else builds on it.
