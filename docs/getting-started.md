# Getting started — build a fullstack OwlMeans Common app

This guide walks you through building a **minimal fullstack OwlMeans Common app** with three
workspaces — `common`, `api` and `web` — using **in-memory and static resources** so there is no
database, no external service, and **no authentication** to set up. You get:

- a **shared contract** (`common`): routes/entrypoints, schemas and types used by both sides;
- a **backend** (`api`) built on `@owlmeans/server-app` that keeps session data in an
  **in-memory static resource** (`@owlmeans/static-resource`);
- a **web UI** (`web`) built on `@owlmeans/web-panel` with **shadcn UI** navigation, a layout, and
  a couple of screens.

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
npx @owlmeans/create-app my-app
```

This generates the three-workspace project below, installs dependencies, and — by default —
**deploys agent guidance** into the project via
[`@owlmeans/agent-skills`](https://www.npmjs.com/package/@owlmeans/agent-skills)
(Claude Code skills under `.claude/skills/`, GitHub Copilot instructions under
`.github/instructions/`).

It also writes **`CLAUDE.md`** and **`.github/copilot-instructions.md`** — each carrying the four
mandatory sections a real OwlMeans monorepo uses (Git Workflow, Reporting, Memory, Self-Education)
plus a project-purpose placeholder: the first time you open the project in Claude Code or Copilot,
the agent will ask what the project is for and fill it in. Agent memory is a single shared graph
store at **`.agents/memory/`** (index `MEMORY.md`), used by both tools — the scaffold seeds the
index for you.

The harness guidance ships with the project itself (`agent-memory`, `memory-promotion`,
`memory-recompact`, `self-education`, `skill-authoring`, `git`, `reuse-code`, `getting-started`), so
it is present even with `--no-install`, and the project can grow its own guidance from day one.

Useful flags: `--pm <bun|npm|yarn>`, `--no-install`, `--no-skills`, `--no-git`, `--name <name>`,
`--yes`. See `npx @owlmeans/create-app --help`.

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
  "packageManager": "bun@1.3.10",
  "workspaces": ["sources/*"],
  "scripts": {
    "dev": "bun run --filter './sources/common' build && bun run --filter './sources/*' --parallel dev",
    "build": "bun run --filter './sources/*' build"
  },
  "overrides": { "react-router": "^7.*" }
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
export const web = { session: 'my-app:web:session' }
```

`sources/common/src/modules.ts`:

```ts
import { body, entrypoint, filter, params } from '@owlmeans/entrypoint'
import { route, RouteMethod } from '@owlmeans/route'
import { session } from './consts.js'
import { AddItemSchema, ItemParamsSchema, SessionParamsSchema } from './schemas.js'
import type { AddItemPayload, ItemParams, SessionParams } from './types.js'

export const sessionModules = [
  entrypoint(route(session.base, '/session')),
  entrypoint(route(session.list, '/:sid/items', { parent: session.base, method: RouteMethod.GET }),
    filter(params<SessionParams>(SessionParamsSchema))),
  entrypoint(route(session.add, '/:sid/items', { parent: session.base, method: RouteMethod.POST }),
    filter(params<SessionParams>(SessionParamsSchema, body<AddItemPayload>(AddItemSchema)))),
  entrypoint(route(session.remove, '/:sid/items/:id', { parent: session.base, method: RouteMethod.DELETE }),
    filter(params<ItemParams>(ItemParamsSchema))),
]
```

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

> `@owlmeans/static-resource`'s `list()` returns every record (it does not accept criteria), so the
> `list` handler lists all and filters by `sessionId` in JS. That is the whole "session scoping":
> each browser sends its own `sid`.

`sources/api/src/modules.ts` attaches handlers and merges the framework's default `modules`:

```ts
import { elevate, modules } from '@owlmeans/server-app'
import { session, sessionModules } from 'my-app-common'
import * as handlers from './app/session/index.js'

elevate(sessionModules, session.base)
elevate(sessionModules, session.list, handlers.list)
elevate(sessionModules, session.add, handlers.add)
elevate(sessionModules, session.remove, handlers.remove)

export const appModules = [...modules, ...sessionModules]
```

`sources/api/src/index.ts` boots it:

```ts
import { main } from '@owlmeans/server-app'
import config from './config.js'
import { makeContext } from './context.js'
import { appModules } from './modules.js'

main(makeContext(config), appModules)
```

(`config.ts` does `config(APP_API, commonConfig)` and sets `cfg.port = API_PORT`.)

### 4. `sources/web` — shadcn UI navigation + layout

The web layer wraps `@owlmeans/web-panel`'s `PanelApp` (already shadcn/Tailwind v4 — no MUI). The
**app provides** the shadcn primitives at the `@` alias. `web-panel` references exactly these:
`@/lib/utils` and `@/components/ui/{alert,button,card,input,label,progress}` — copy those files
(and `cn()`) into `src/` from the shadcn registry or from `@owlmeans/web-panel`'s own copies.

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
variant).

Render with `provide` from `web-client`:

```tsx
import { render as basicRender, provide } from '@owlmeans/web-client'
import { PanelApp } from '@owlmeans/web-panel'

export const render = (context) =>
  basicRender(<PanelApp context={context} provide={provide} />)
```

Wire routes to components in `src/modules.ts`. A parent `BASE` route renders the layout; `HOME` is
its default child; the session screen is another child. `elevate` the backend entrypoints (no
component) so the client can call them:

```ts
import { BASE, elevate, entrypoint, frontend, handler, HOME, modules as baseModules, route } from '@owlmeans/web-panel'
import { session, sessionModules, web } from 'my-app-common'
import { MainLayout } from './layout/main.js'
import { HomeScreen } from './screens/home.js'
import { SessionScreen } from './screens/session.js'

const modules = [...baseModules, ...sessionModules]
elevate(modules, session.base); elevate(modules, session.list)
elevate(modules, session.add);  elevate(modules, session.remove)

modules.push(entrypoint(route(BASE, '/', frontend()), handler(MainLayout)))
modules.push(entrypoint(route(HOME, '/', frontend({ default: true, parent: BASE })), handler(HomeScreen)))
modules.push(entrypoint(route(web.session, '/session', frontend({ parent: BASE })), handler(SessionScreen)))

export const appModules = modules
```

A screen calls the backend with `context.entrypoint(alias).call({ params, body })`, which returns
`[data, outcome]`:

```tsx
const [items] = await ctx.entrypoint(session.list).call({ params: { sid } })
await ctx.entrypoint(session.add).call({ params: { sid }, body: { text } })
```

The layout is plain shadcn JSX (a header with the app name + a `MainNavigation` of `Button`s using
`useNavigate().press(routeId)`), and renders `{children}` (the matched child screen).

Finally `src/index.tsx` registers entrypoints and service routes, then renders:

```tsx
import './index.css'
import { APP_API, APP_WEB } from 'my-app-common'
// ...
const context = makeContext(config)
context.registerEntrypoints(appModules)
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
npx @owlmeans/agent-skills
```

This scans every `node_modules/@owlmeans/*/agent-meta/` in the workspace — the root **and** any nested
under `sources/*` (bun often keeps workspace-only deps there) — and copies guidance into
`.claude/skills/` and `.github/instructions/`. Re-run after upgrading `@owlmeans/*` packages.

---

## How it works

| Concern | Package | What you wrote |
|---------|---------|----------------|
| Shared routes + validation + types | `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/config` | `sources/common` |
| Backend server + handlers | `@owlmeans/server-app` | `makeContext`, `elevate`, `main` |
| In-memory session store | `@owlmeans/static-resource` | `appendStaticResource` + `getStaticResource` |
| Web shell, routing, i18n | `@owlmeans/web-panel`, `@owlmeans/web-client` | `PanelApp`, `provide`, `elevate(handler(...))` |
| shadcn UI primitives | (app-provided at `@`) | `src/components/ui/*`, `src/lib/utils.ts` |

**The single source of truth is `sources/common`.** The api elevates its entrypoints with handlers;
the web elevates the same entrypoints with screen components and calls them. Change a route or
schema once and both sides stay in sync.

## Where to go next

- Swap in a real database: `@owlmeans/mongo` + `@owlmeans/mongo-resource` (or
  `@owlmeans/redis` + `@owlmeans/redis-resource`) instead of `@owlmeans/static-resource`.
- Add authentication: `@owlmeans/server-auth` + `@owlmeans/client-auth` and `guard(...)` on
  entrypoints.
- Per-package guidance lives in each package's skill (`.claude/skills/<name>/SKILL.md`) — installed
  into your project by `@owlmeans/agent-skills`.
