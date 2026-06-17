---
name: getting-started
description: How to build a fullstack OwlMeans Common app from scratch — the common/api/web three-workspace pattern, context bootstrap on server and web, shared entrypoints + elevate(), and a session-scoped in-memory resource with @owlmeans/static-resource. Use when starting a new OwlMeans project, wiring web↔api, or asked how the pieces fit together.
user-invocable: true
scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Getting started with OwlMeans Common — fullstack app shape

A minimal OwlMeans app is a **bun-workspace monorepo with three packages**:

```
sources/
├── common/   # shared entrypoints (routes), AJV schemas, types, config — the single source of truth
├── api/      # @owlmeans/server-app backend; handlers attached to the shared entrypoints
└── web/      # @owlmeans/web-panel + shadcn UI; screens attached to the same entrypoints
```

The full, runnable walkthrough (scaffolded **and** manual) lives in
[`docs/getting-started.md`](../../../docs/getting-started.md). To generate this exact project, use
[[scaffolding]] (`npm create @owlmeans/app`). This skill is the mental model.

## The core idea: one contract, two sides

Declare each route once in `common` as an **entrypoint**, then `elevate()` it on each side:

```ts
// common/modules.ts — declaration + validation, no implementation
export const sessionModules = [
  entrypoint(route(session.base, '/session')),
  entrypoint(route(session.list, '/:sid/items', { parent: session.base, method: RouteMethod.GET }),
    filter(params<SessionParams>(SessionParamsSchema))),
  entrypoint(route(session.add, '/:sid/items', { parent: session.base, method: RouteMethod.POST }),
    filter(params<SessionParams>(SessionParamsSchema, body<AddItemPayload>(AddItemSchema)))),
]
```

```ts
// api/modules.ts — attach handlers
elevate(sessionModules, session.list, handlers.list)
export const appModules = [...modules, ...sessionModules]        // `modules` = framework defaults
```

```ts
// web/modules.ts — attach screen components, plus call-only elevation for backend routes
elevate(modules, session.list)                                    // callable from the client
modules.push(entrypoint(route(web.session, '/session', frontend({ parent: BASE })), handler(SessionScreen)))
```

Change a route or schema in `common` and both sides stay in sync. See [[entrypoint]], [[route]],
[[server-app]], [[web-client]], [[web-panel]].

## Shared config (where services live)

`common/config.ts` registers both services so the web knows where the API is. `base: 'api'`
prefixes API routes with `/api`:

```ts
const cfg = service({ type: AppType.Frontend, service: APP_WEB, host: 'localhost', port: 3001 })
service({ type: AppType.Backend, service: APP_API, host: 'localhost', port: 3000, base: 'api' }, cfg)
cfg.debug = { all: true }
export const commonConfig = cfg
```

api: `config(APP_API, commonConfig)` (+ `cfg.port`). web: `config(APP_WEB, commonConfig)`. See [[config]].

## Backend bootstrap + in-memory data

```ts
// api/context.ts
const context = makeContext(cfg, true)          // from @owlmeans/server-app
appendStaticResource(context, SESSION_ITEMS)    // @owlmeans/static-resource — in-memory, no DB
```

Handlers use `handleRequest` / `handleBody` / `handleParams` (validated payload, then context, then
req). Read/write `ctx.getStaticResource<T>(alias)` — full CRUD (`get/load/list/create/save/delete`).
**`static-resource.list()` takes no criteria** — list all and filter in JS (e.g. by `sessionId`).
`main(context, appModules)` starts the server. See [[static-resource]], [[server-app]], [[resource]].

Swap `@owlmeans/static-resource` for [[mongo-resource]] / [[redis-resource]] when you need
persistence — the handler shape is identical.

## Web bootstrap (shadcn)

`@owlmeans/web-panel`'s `PanelApp` is shadcn/Tailwind v4 (no MUI). The **app provides** the shadcn
primitives at the `@` alias — `web-panel` references `@/lib/utils` and
`@/components/ui/{alert,button,card,input,label,progress}`; copy those into `src/`. Render with
`provide` from `@owlmeans/web-client`:

```tsx
basicRender(<PanelApp context={context} provide={provide} />)
```

`vite.config.ts` sets `@`→`src`, `@tailwindcss/vite`, and dedupes the owlmeans/react singletons.
`index.css` is `@import "tailwindcss";` + a shadcn `@theme` token block (replaces `@owlmeans/owl-theme`).
A parent `BASE` route renders the layout via `handler(LayoutComponent)`; `HOME` is its default child.
Screens call the backend with `context.entrypoint(alias).call({ params, body })` → `[data, outcome]`.
See [[web-panel]], [[web-client]], [[shadcn-web]], [[client-entrypoint]].

## Authentication

This shape is intentionally **auth-free**. To add it: `@owlmeans/server-auth` + `@owlmeans/client-auth`
and `guard(...)` on entrypoints. See [[auth-protocol]], [[server-auth]], [[client-auth]].
