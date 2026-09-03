# Getting started — build a fullstack OwlMeans Common app

This guide walks you through building a **minimal fullstack OwlMeans Common app** with three
workspaces — `common`, `api` and `web` — using **in-memory and static resources** so there is no
database, no external service, and **no authentication** to set up. You get:

- a **shared contract** (`common`): routes/entrypoints, schemas and types used by both sides;
- a **backend** (`api`) built on `@owlmeans/server-app` that keeps session data in an
  **in-memory static resource** (`@owlmeans/static-resource`);
- a **web UI** (`web`) built on `@owlmeans/web-panel` with **shadcn UI**, a two-layer navigation
  shell declared as data, and a few screens.

The result is a working app whose **Session** screen creates, lists and removes items stored
**per browser session** in process memory on the API.

There are two ways to get there:

- **[Option A — Scaffold it](#option-a--scaffold-it-recommended)** with `@owlmeans/create-app` (one command).
- **[Option B — Do it manually](#option-b--do-it-manually)** to understand every moving part.

Both produce the same project. If you only want to run something, use Option A. If you want to
learn the framework, read Option B.

> This mirrors how real OwlMeans apps are structured (see the `viable` reference), stripped down to
> the essentials. When you later need a database, auth, OIDC, websockets, etc., swap the in-memory
> resource for `@owlmeans/mongo-resource` / `@owlmeans/redis-resource` and add the relevant
> server/client packages — the shape stays the same.

---

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3 (recommended). `npm` or `yarn` also work.
- Node.js ≥ 20 (for `npx`).

---

## Option A — Scaffold it (recommended)

```sh
npm create @owlmeans/app@latest my-app
# or
bun create @owlmeans/app my-app
# or
yarn create @owlmeans/app my-app
# or
npx @owlmeans/create-app@^0.1.18-rc.14 my-app
```

This generates the three-workspace project below, installs dependencies, and — by default —
**deploys agent guidance** into the project via
[`@owlmeans/agent-skills`](https://www.npmjs.com/package/@owlmeans/agent-skills)
(agent skills under `.agents/skills/`).

It also writes **`AGENTS.md`** — the always-on project context every coding agent reads — carrying
the four mandatory sections a real OwlMeans monorepo uses (Git Workflow, Reporting, Memory,
Self-Education) plus a project-purpose placeholder: the first time you open the project in an
agent, it will ask what the project is for and fill it in. A thin **`CLAUDE.md`** imports
`AGENTS.md` and keeps the symlinks Claude Code needs in `.claude/skills/` fresh. Agent memory is a
single shared graph store at **`.agents/memory/`** (index `MEMORY.md`) — the scaffold seeds the
index for you.

The harness guidance ships with the project itself (`agent-memory`, `memory-promotion`,
`memory-recompact`, `self-education`, `skill-authoring`, `git`, `reuse-code`, `getting-started`), so
it is present even with `--no-install`, and the project can grow its own guidance from day one.

Useful flags: `--pm <bun|npm|yarn>`, `--no-install`, `--no-skills`, `--no-git`, `--name <name>`,
`--yes`. See `npx @owlmeans/create-app@^0.1.18-rc.14 --help`.

Then run it:

```sh
cd my-app
bun run dev          # API on :3000, web on :3001
```

Open <http://localhost:3001>, go to **Session**, and add/remove items. Refresh — they persist for
your session (a `sid` kept in `localStorage`). Restart the API and they are gone (in-memory).

Jump to [How it works](#how-it-works) for an explanation of the generated code.

---

## Option B — Do it manually

### 1. Create the workspace

```sh
mkdir my-app && cd my-app
git init
```

`package.json` (bun workspaces):

```json
{
  "name": "my-app",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.4.0",
  "workspaces": ["sources/*"],
  "scripts": {
    "dev": "bun run --filter './sources/common' build && bun run --filter './sources/*' --parallel dev",
    "build": "bun run --filter './sources/*' build"
  }
}
```

Add a `.gitignore` with `node_modules`, `build`, `dist`, `*.tsbuildinfo`.

Every package extends the shared TypeScript configs from `@owlmeans/dep-config` (a published
package) — add it as a dev dependency in each workspace and `extends` its `tsconfig.base.json`
(plus `tsconfig.react.json` for web, `tsconfig.node.json` for the api).

### 2. `sources/common` — the shared contract

Declare the API as OwlMeans **entrypoints**: a `route()` (id + path + method) wrapped by
`entrypoint()`, with `filter(params(...) / body(...))` for AJV validation. Use a session id as a
route param so the demo needs no auth.

`sources/common/src/consts.ts`:

```ts
export const APP = 'my-app'
export const APP_WEB = 'my-app-web'
export const APP_API = 'my-app-api'
export const WEB_PORT = 3001
export const API_PORT = 3000

export const session = {
  base: 'my-app:api:session',
  list: 'my-app:api:session:list',
  add: 'my-app:api:session:add',
  remove: 'my-app:api:session:remove',
}
export const web = { session: 'my-app:web:session', about: 'my-app:web:about' }
```

`sources/common/src/entrypoints.ts`:

```ts
import { body, entrypoint, filter, params } from '@owlmeans/entrypoint'
import { route, RouteMethod } from '@owlmeans/route'
import { session } from './consts.js'
import { AddItemSchema, ItemParamsSchema, SessionParamsSchema } from './schemas.js'
import type { AddItemPayload, ItemParams, SessionParams } from './types.js'

export const sessionEntrypoints = [
  entrypoint(route(session.base, '/session')),
  entrypoint(route(session.list, '/:sid/items', { parent: session.base, method: RouteMethod.GET }),
    filter(params<SessionParams>(SessionParamsSchema))),
  entrypoint(route(session.add, '/:sid/items', { parent: session.base, method: RouteMethod.POST }),
    filter(params<SessionParams>(SessionParamsSchema, body<AddItemPayload>(AddItemSchema)))),
  entrypoint(route(session.remove, '/:sid/items/:id', { parent: session.base, method: RouteMethod.DELETE }),
    filter(params<ItemParams>(ItemParamsSchema))),
]
```

A route declaration is plain, immutable data, and its `path` is the **segment** it contributes
under its `parent` — nothing rewrites it later. `session.list` therefore reads `/:sid/items` under
`session.base`'s `/session`, under the api service's `base: 'api'`, and the address
`GET /api/session/:sid/items` is computed on demand by whoever asks for it. That is why the same
declaration serves the server that mounts it and the browser that calls it.

The shared config registers both services (so the web knows where the API lives). `base: 'api'`
prefixes every API route with `/api`. `security.unsecure` is required in local dev because the API
serves plain HTTP — without it the web client builds `https://` URLs and every call fails:

```ts
import { AppType, service } from '@owlmeans/config'
import { API_PORT, APP_API, APP_WEB, WEB_PORT } from './consts.js'

const cfg = service({ type: AppType.Frontend, service: APP_WEB, host: 'localhost', port: WEB_PORT })
service({ type: AppType.Backend, service: APP_API, host: 'localhost', port: API_PORT, base: 'api' }, cfg)
cfg.debug = { all: true }
cfg.alias = APP
// Local dev serves the API over plain HTTP. Remove this in production (use TLS).
cfg.security = { unsecure: true }
export const commonConfig = cfg
```

Add `types.ts` (`SessionItem`, `AddItemPayload`, `SessionParams`, `ItemParams`) and `schemas.ts`
(AJV `JSONSchemaType` for each payload), then re-export everything from `index.ts`.

### 3. `sources/api` — backend with an in-memory session resource

Register the static resource in the context and `elevate()` each entrypoint with a handler.

`sources/api/src/context.ts`:

```ts
import { makeContext as makeBasicContext } from '@owlmeans/server-app'
import { appendStaticResource } from '@owlmeans/static-resource'
import { SESSION_ITEMS } from './consts.js'

export const makeContext = (cfg) => {
  const context = makeBasicContext(cfg, true)
  appendStaticResource(context, SESSION_ITEMS)   // in-memory; no DB
  return context
}
```

Handlers read/write `ctx.getStaticResource(SESSION_ITEMS)`. `handleParams` / `handleBody` give you
the validated params/body; the second argument is the context:

```ts
import { handleBody } from '@owlmeans/server-app'
import { randomUUID } from 'node:crypto'

export const add = handleBody(async (payload, context, req) => {
  const { sid } = req.params
  const resource = context.getStaticResource(SESSION_ITEMS)
  return await resource.create({ id: randomUUID(), sessionId: sid, text: payload.text, createdAt: new Date().toISOString() })
})
```

The `list` handler asks the resource the whole question rather than filtering afterwards — every
resource takes the same criteria language, and the in-memory ones are unpaged:

```ts
import { handleParams } from '@owlmeans/server-app'

export const list = handleParams<SessionParams>(async (params, context) => {
  const resource = context.getStaticResource<SessionItem>(SESSION_ITEMS)
  const { items } = await resource.list(
    { sessionId: params.sid },
    { sort: [{ field: 'createdAt', order: 'desc' }] }
  )

  return items
})
```

> `list` answers `{ items, total }`. A bare criteria value means equality and a bare array means
> "any of these"; `sort` is a field name or `{ field, order }`. That criteria on `sessionId` is the
> whole "session scoping": each browser sends its own `sid`.

`sources/api/src/entrypoints.ts` attaches handlers and merges the framework's default `entrypoints`:

```ts
import { elevate, entrypoints } from '@owlmeans/server-app'
import { session, sessionEntrypoints } from 'my-app-common'
import * as handlers from './app/session/index.js'

elevate(sessionEntrypoints, session.base)
elevate(sessionEntrypoints, session.list, handlers.list)
elevate(sessionEntrypoints, session.add, handlers.add)
elevate(sessionEntrypoints, session.remove, handlers.remove)

export const appEntrypoints = [...entrypoints, ...sessionEntrypoints]
```

`elevate` replaces the declaration in the list it is given, and it is idempotent — elevating an
alias again is allowed, and any guards named at elevation are added to the ones the declaration
already carries rather than replacing them.

`sources/api/src/index.ts` boots it:

```ts
import { main } from '@owlmeans/server-app'
import config from './config.js'
import { makeContext } from './context.js'
import { appEntrypoints } from './entrypoints.js'

main(makeContext(config), appEntrypoints)
```

(`config.ts` does `config(APP_API, commonConfig)` and sets `cfg.port = API_PORT`.)

### 4. `sources/web` — shadcn UI navigation + layout

The web layer wraps `@owlmeans/web-panel`'s `PanelApp` (already shadcn/Tailwind v4 — no MUI). The
**app provides** the shadcn primitives at the `@` alias. `web-panel` references exactly these:
`@/lib/utils` and `@/components/ui/{alert,button,card,input,label,navigation-menu,progress}` — copy
those files (and `cn()`) into `src/` from the shadcn registry or from `@owlmeans/web-panel`'s own
copies. `navigation-menu` also needs `@radix-ui/react-navigation-menu` in the app's dependencies,
alongside the other Radix peers.

`vite.config.ts` wires the `@` alias, Tailwind v4 and React:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  server: { port: 3001, strictPort: true },
  resolve: {
    alias: [{ find: '@', replacement: path.resolve(__dirname, 'src') }],
    dedupe: ['react', 'react-dom', '@owlmeans/client', '@owlmeans/web-client', '@owlmeans/web-panel'],
  },
})
```

`src/index.css` is `@import "tailwindcss";` plus a shadcn `@theme` token block (this replaces what
`@owlmeans/owl-theme` would provide — `--color-background`, `--color-primary`, … and a `.dark`
variant) — and one `@source` line:

```css
@import "tailwindcss";

@source "../../../node_modules/@owlmeans/web-panel/build";
```

Tailwind scans this app's sources plus whatever `@source` names, and `node_modules` is excluded from
that scan by default. Without the line, the classes that exist **only** inside `@owlmeans/web-panel`
components — the whole navigation shell and footer — never reach the stylesheet and the app renders
an unstyled menu. Every consumer of `web-panel` needs it, not just this scaffold.

`src/context.ts` builds the browser context — one factory, called once per process, composing the
layer below plus the `append*` mixins this app needs:

```ts
import { makeContext as makeBasicContext } from '@owlmeans/web-panel'
import { appendStateResource } from '@owlmeans/state'

export const SESSION_STATE = 'session-items'

export const makeContext = (cfg) => {
  const context = makeBasicContext(cfg)
  appendStateResource(context, SESSION_STATE)   // the client store the screens read
  return context
}
```

A state resource lives **on the context**, which is what separates it from a store held beside the
app: a screen, a guard and a service all reach the same records through the same container.

Render with `render` from `web-client`. Routing resolves itself from the active router plugin —
`makeContext` already registered `@owlmeans/web-router`, so `PanelApp` takes no router prop:

```tsx
import { render as basicRender } from '@owlmeans/web-client'
import { PanelApp } from '@owlmeans/web-panel'

export const render = (context) =>
  basicRender(<PanelApp context={context} />)
```

Wire routes to components in `src/entrypoints.ts`. A parent `BASE` route renders the layout; `HOME`
is its default child; the session and about screens are further children. `elevate` the backend
entrypoints (no component) so the client can call them:

```ts
import { BASE, elevate, entrypoint, entrypoints as baseEntrypoints, frontend, handler, HOME, route } from '@owlmeans/web-panel'
import { session, sessionEntrypoints, web } from 'my-app-common'
import { MainLayout } from './layout/main.js'
import { AboutScreen } from './screens/about.js'
import { HomeScreen } from './screens/home.js'
import { SessionScreen } from './screens/session.js'

const entrypoints = [...baseEntrypoints, ...sessionEntrypoints]
elevate(entrypoints, session.base); elevate(entrypoints, session.list)
elevate(entrypoints, session.add);  elevate(entrypoints, session.remove)

entrypoints.push(entrypoint(route(BASE, '/', frontend()), handler(MainLayout)))
entrypoints.push(entrypoint(route(HOME, '/', frontend({ default: true, parent: BASE })), handler(HomeScreen)))
entrypoints.push(entrypoint(route(web.session, '/session', frontend({ parent: BASE })), handler(SessionScreen)))
entrypoints.push(entrypoint(route(web.about, '/about', frontend({ parent: BASE })), handler(AboutScreen)))

export const appEntrypoints = entrypoints
```

A frontend entrypoint that **has children needs one of them declared `default: true`** — that is
why `BASE` gets `HOME`. Without a default child a parent route renders blank at its own path.

Calling a backend alias from the client is that bare `elevate` — an explicit opt-in, so nothing the
app never asked for becomes reachable from the browser. Once elevated, an entrypoint answers three
explicit questions:

```tsx
const items = await ctx.entrypoint(session.list).call({ params: { sid } })   // the value
const { value, outcome } = await ctx.entrypoint(session.add)
  .invoke({ params: { sid }, body: { text } })                              // value + outcome
const href = await ctx.entrypoint(web.about).url()                          // the address
```

`call` resolves to what the endpoint answered and throws the reply's error, so a caller that only
needs the value never inspects an outcome. `invoke` gives `{ value, outcome }` for the cases where
the outcome decides what happens next. `url` builds the address with `:params` filled in and the
query appended — absolute when the route belongs to another service, or when you ask with
`{ absolute: true }`. A **screen** entrypoint answers `url()` and refuses `call()`/`invoke()`: a
screen is navigated to, not called.

The screen keeps nothing in component state. `makeContext` registers a `@owlmeans/state` resource,
and the screen subscribes to it:

```tsx
import { useStoreList } from '@owlmeans/client'

const store = ctx.getStateResource<SessionItem>(SESSION_STATE)
const items = useStoreList<SessionItem>({ resource: SESSION_STATE })

const load = async () => {
  const data = await ctx.entrypoint(session.list).call({ params: { sid } })
  await store.replace(data)
}
```

`replace` writes every record it is given and drops every record it does not name, which is exactly
what "the server just told us what exists" means — saving item by item would leave behind the ones
deleted elsewhere. Subsequent writes are ordinary resource calls (`store.save(item)` after an add,
`store.delete(id)` after a remove) and every subscriber re-renders on its own.

`useStoreList` hands back **models**, not bare records, so the row reads `item.record.text` and
writes with `item.update({ ... })`. `useStoreModel(id)` is the single-record form; when the store
holds nothing under that id the model's `empty` is true instead of throwing.

Navigation is **data**, kept in `src/nav.ts`. Sections are the top menu; a section's items are the
side menu shown while that section is active:

```ts
import { HOME } from '@owlmeans/web-panel'
import type { PanelNavConfig, PanelNavLink } from '@owlmeans/web-panel'
import { web } from 'my-app-common'

export const navConfig: PanelNavConfig = {
  sections: [
    { name: 'home', label: 'Home', items: [{ alias: HOME, label: 'Overview' }] },
    {
      name: 'demo', label: 'Demo', items: [
        { alias: web.session, label: 'Session' },
        { alias: web.about, label: 'About' },
      ]
    },
  ],
}

export const footerLinks: PanelNavLink[] = [
  { alias: HOME, label: 'My App' },
  { href: 'https://owlmeans.com', label: 'OwlMeans', open: true },
]
```

An item addresses a screen by **entrypoint alias**, never by URL — the router resolves the path, so
it stays correct when a route changes shape. Note the two shapes above: **Demo** holds two screens,
so its side menu renders; **Home** holds one, and a section with a single screen renders **no side
menu at all**.

`src/layout/main.tsx` is then just the shell — `NavLayout` draws the header, the section menu, the
active section's screen menu, the content and the footer, and the matched child screen arrives as
`children`:

```tsx
import type { FC, PropsWithChildren } from 'react'
import { NavLayout } from '@owlmeans/web-panel'
import { footerLinks, navConfig } from '@/nav'

export const MainLayout: FC<PropsWithChildren> = ({ children }) => (
  <NavLayout nav={navConfig} title="My App" footer={footerLinks} contentClassName="mx-auto w-full max-w-4xl">
    {children}
  </NavLayout>
)
```

Labels above are literal. Drop them and they resolve through the panel i18n keys instead
(`nav.<section>` for sections, `modules.<alias>` for items and footer links), falling back to a
humanized alias — `NavLayout` takes a `translate` prop for that and never reads an i18n context on
its own, so this app, which mounts no i18n provider, still renders.

Finally `src/index.tsx` registers entrypoints and service routes, then renders:

```tsx
import './index.css'
import { APP_API, APP_WEB } from 'my-app-common'
// ...
const context = makeContext(config)
context.registerEntrypoints(appEntrypoints)
context.serviceRoute(APP_WEB, true)
context.serviceRoute(APP_API, true)
render(context)
```

### 5. Run it

```sh
bun install
bun run dev      # API :3000, web :3001
```

### 6. Add agent guidance

Install the OwlMeans Claude Code skills and Copilot instructions into the project:

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.11
```

This scans every `node_modules/@owlmeans/*/agent-meta/` in the workspace — the root **and** any nested
under `sources/*` (bun often keeps workspace-only deps there) — and copies guidance into
`.agents/skills/`. Re-run after upgrading `@owlmeans/*` packages.

---

## How it works

| Concern | Package | What you wrote |
|---------|---------|----------------|
| Shared routes + validation + types | `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/config` | `sources/common` |
| Backend server + handlers | `@owlmeans/server-app` | `makeContext`, `elevate`, `main` |
| In-memory session store | `@owlmeans/static-resource` | `appendStaticResource` + `getStaticResource` |
| Web shell, routing, i18n | `@owlmeans/web-panel`, `@owlmeans/web-client` | `PanelApp`, `elevate(handler(...))` |
| Client store the screens read | `@owlmeans/state` (hooks: `@owlmeans/client`) | `appendStateResource`, `store.replace`, `useStoreList` |
| Two-layer navigation + footer | `@owlmeans/web-panel` (model: `@owlmeans/client-panel`) | `src/nav.ts`, `NavLayout` in `src/layout/main.tsx` |
| shadcn UI primitives | (app-provided at `@`) | `src/components/ui/*`, `src/lib/utils.ts`, the `@source` line in `src/index.css` |

**The single source of truth is `sources/common`.** The api elevates its entrypoints with handlers;
the web elevates the same entrypoints with screen components and calls them. Change a route or
schema once and both sides stay in sync.

## Where to go next

- Swap in a real database: `@owlmeans/mongo` + `@owlmeans/mongo-resource` (or
  `@owlmeans/redis` + `@owlmeans/redis-resource`) instead of `@owlmeans/static-resource`.
- Add authentication: `@owlmeans/server-auth` + `@owlmeans/client-auth` and `guard(...)` on
  entrypoints.
- Per-package guidance lives in each package's skill (`.agents/skills/<name>/SKILL.md`) — installed
  into your project by `@owlmeans/agent-skills`.
