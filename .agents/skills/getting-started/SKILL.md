---
name: getting-started
description: How to build a fullstack OwlMeans Common app from scratch — the common/api/web three-workspace pattern, context bootstrap on server and web, shared entrypoints + elevate(), and a session-scoped in-memory resource with @owlmeans/static-resource. Use when starting a new OwlMeans project, wiring web↔api, or asked how the pieces fit together.
user-invocable: true
metadata:
  scope: general
---

# Getting started with OwlMeans Common — fullstack app shape

A minimal OwlMeans app is a **bun-workspace monorepo with three packages**:

```
sources/
├── common/   # shared entrypoints (routes), AJV schemas, types, config — the single source of truth
│             #   entrypoints.ts
├── api/      # @owlmeans/server-app backend; handlers attached to the shared entrypoints
│             #   context.ts, entrypoints.ts, app/<area>/*, index.ts
└── web/      # @owlmeans/web-panel + shadcn UI; screens attached to the same entrypoints
              #   context.ts, entrypoints.ts, nav.ts, layout/, screens/, render.tsx, index.tsx
```

Three workspaces is the whole shape — a backend that needs its own long-running worker or a second
API adds a workspace beside them and shares the same `common`.

The full, runnable walkthrough (scaffolded **and** manual) lives in the
[OwlMeans getting-started guide](https://github.com/owlmeans/common/blob/main/docs/getting-started.md).
To generate this exact project, use [[scaffolding]] (`npm create @owlmeans/app`). This skill is the
mental model.

## The core idea: one contract, two sides

Declare each route once in `common` as an **entrypoint**, then `elevate()` it on each side:

```ts
// common/entrypoints.ts — declaration + validation, no implementation
export const sessionEntrypoints = [
  entrypoint(route(session.base, '/session')),
  entrypoint(route(session.list, '/:sid/items', { parent: session.base, method: RouteMethod.GET }),
    filter(params<SessionParams>(SessionParamsSchema))),
  entrypoint(route(session.add, '/:sid/items', { parent: session.base, method: RouteMethod.POST }),
    filter(params<SessionParams>(SessionParamsSchema, body<AddItemPayload>(AddItemSchema)))),
]
```

```ts
// api/entrypoints.ts — attach handlers
elevate(sessionEntrypoints, session.list, handlers.list)
export const appEntrypoints = [...entrypoints, ...sessionEntrypoints]   // `entrypoints` = framework defaults
```

```ts
// web/entrypoints.ts — attach screen components, plus call-only elevation for backend routes
const entrypoints = [...baseEntrypoints, ...sessionEntrypoints]   // `baseEntrypoints` from web-panel
elevate(entrypoints, session.list)                                // callable from the client
entrypoints.push(entrypoint(route(web.session, '/session', frontend({ parent: BASE })), handler(SessionScreen)))
export const appEntrypoints = entrypoints
```

A route declaration is plain data: its `path` is the SEGMENT it contributes under its `parent`, and
nothing ever rewrites it. `session.list` reads `/:sid/items` under `session.base`'s `/session`,
under the api service's `base: 'api'` — so the address is `GET /api/session/:sid/items`, computed
on demand by whoever asks. `elevate` is idempotent, so re-elevating an alias is allowed and guards
given at elevation are added to the declared ones.

Change a route or schema in `common` and both sides stay in sync. See [[entrypoint]], [[route]],
[[server-app]], [[web-client]], [[web-panel]].

## Shared config (where services live)

`common/config.ts` registers both services so the web knows where the API is. `base: 'api'`
prefixes API routes with `/api`:

```ts
const cfg = service({ type: AppType.Frontend, service: APP_WEB, host: 'localhost', port: 3001 })
service({ type: AppType.Backend, service: APP_API, host: 'localhost', port: 3000, base: 'api' }, cfg)
cfg.debug = { all: true }
cfg.alias = APP
cfg.security = { unsecure: true }   // local dev serves the API over plain HTTP
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
req). Read/write `ctx.getStaticResource<T>(alias)` — the full resource contract
(`get/load/list/count/create/update/save/delete/take/purge`), so the resource answers the whole
question rather than the handler filtering afterwards:

```ts
const { items } = await resource.list(
  { sessionId: params.sid },
  { sort: [{ field: 'createdAt', order: 'desc' }] }
)
```

`list` returns `{ items, total }`; the in-memory backends are unpaged unless a `size` is asked for.
`main(context, appEntrypoints)` starts the server. See [[static-resource]], [[server-app]],
[[resource]].

Swap `@owlmeans/static-resource` for [[mongo-resource]] / [[redis-resource]] when you need
persistence — the handler shape is identical.

## Web bootstrap (shadcn)

`@owlmeans/web-panel`'s `PanelApp` is shadcn/Tailwind v4 (no MUI). The **app provides** the shadcn
primitives at the `@` alias — `web-panel` references `@/lib/utils` and
`@/components/ui/{alert,button,card,input,label,navigation-menu,progress}`; copy those into `src/`.
Routing resolves itself from the active router plugin, so `PanelApp` takes no router prop —
`render.tsx` is one line and `index.tsx` calls it:

```tsx
// render.tsx — import { render as basicRender } from '@owlmeans/web-client'
basicRender(<PanelApp context={context} />)
```

`vite.config.ts` sets `@`→`src`, `@tailwindcss/vite`, and dedupes the owlmeans/react singletons.
`index.css` is `@import "tailwindcss";` + a shadcn `@theme` token block (replaces `@owlmeans/owl-theme`).
A parent `BASE` route renders the layout via `handler(MainLayout)`; `HOME` is its default child, declared `frontend({ default: true, parent: BASE })`.
`index.tsx` calls `context.registerEntrypoints(appEntrypoints)` and `context.serviceRoute(...)` for
each service, then renders.

Screens address the backend through three explicit verbs on the entrypoint:

```tsx
const items = await ctx.entrypoint<ClientEntrypoint<Item[]>>(session.list).call({ params: { sid } })
const { value, outcome } = await ctx.entrypoint<ClientEntrypoint<Item>>(session.add).invoke({ body })
const href = await ctx.entrypoint<ClientEntrypoint<string>>(web.about).url()
```

`call` resolves to the VALUE and throws the reply's error; `invoke` gives `{ value, outcome }` when
the outcome decides what happens next; `url` gives the address (`{ absolute: true }` forces a fully
qualified one). A screen entrypoint answers `url()` and refuses `call()` — a screen is navigated to.
See [[web-panel]], [[web-client]], [[shadcn-web]], [[client-entrypoint]].

The screen keeps nothing in component state: `makeContext` registers a `@owlmeans/state` resource,
the fetch writes what came back into it with `store.replace(items)`, and `useStoreList` renders the
live subscription. See [[state]].

## Authentication

This shape is intentionally **auth-free**. To add it: `@owlmeans/server-auth` + `@owlmeans/client-auth`
and `guard(...)` on entrypoints. See [[auth-protocol]], [[server-auth]], [[client-auth]].
