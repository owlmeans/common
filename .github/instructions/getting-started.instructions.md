---
description: "How to build a fullstack OwlMeans Common app — the common/api/web three-workspace pattern, server and web context bootstrap, shared entrypoints + elevate(), and a session-scoped in-memory resource via @owlmeans/static-resource. Apply when starting a new OwlMeans project or wiring web↔api."
applyTo: "**/modules.ts, **/context.ts, **/config.ts, **/render.tsx, **/index.tsx, **/sources/**"
scope: general
---

# Building a fullstack OwlMeans Common app

A minimal app is a **bun-workspace monorepo with three packages**:

- `sources/common` — shared **entrypoints** (routes), AJV schemas, types and config. The single
  source of truth.
- `sources/api` — `@owlmeans/server-app` backend; handlers attached to the shared entrypoints.
- `sources/web` — `@owlmeans/web-panel` + shadcn UI; screens attached to the same entrypoints.

Full walkthrough: `docs/getting-started.md`. To generate it: `npm create @owlmeans/app`.

## One contract, two sides

Declare each route once in `common`, then `elevate()` it on both sides:

```ts
// common/modules.ts
export const sessionModules = [
  entrypoint(route(session.list, '/:sid/items', { parent: session.base, method: RouteMethod.GET }),
    filter(params(SessionParamsSchema))),
]
// api/modules.ts   → elevate(sessionModules, session.list, handlers.list)
// web/modules.ts   → elevate(modules, session.list)  // call-only; screens via handler(Component)
```

## Config

`common/config.ts` registers both services; `base: 'api'` prefixes API routes with `/api`:

```ts
const cfg = service({ type: AppType.Frontend, service: APP_WEB, host: 'localhost', port: 3001 })
service({ type: AppType.Backend, service: APP_API, host: 'localhost', port: 3000, base: 'api' }, cfg)
```

## Backend + in-memory data

```ts
const context = makeContext(cfg, true)
appendStaticResource(context, SESSION_ITEMS)   // @owlmeans/static-resource — no DB
```

Handlers (`handleRequest`/`handleBody`/`handleParams`) use `ctx.getStaticResource<T>(alias)`.
`static-resource.list()` accepts no criteria — list all and filter in JS. `main(context, appModules)`
starts the server. Swap for `@owlmeans/mongo-resource` / `redis-resource` when you need persistence.

## Web (shadcn)

`web-panel`'s `PanelApp` is shadcn/Tailwind v4. The app **provides** `@/lib/utils` and
`@/components/ui/{alert,button,card,input,label,progress}` at the `@` alias (→ `src`). Render with
`provide` from `@owlmeans/web-client`: `basicRender(<PanelApp context={context} provide={provide} />)`.
A parent `BASE` route renders the layout via `handler(Layout)`; `HOME` is its default child. Screens
call the API with `context.entrypoint(alias).call({ params, body })`.

This shape is auth-free by design; add `@owlmeans/server-auth` + `@owlmeans/client-auth` and
`guard(...)` when needed.
