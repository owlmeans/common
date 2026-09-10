# __APP_NAME__

__APP_DESCRIPTION__

A fullstack [OwlMeans Common](https://github.com/owlmeans/common) app, scaffolded with
[`@owlmeans/create-app`](https://www.npmjs.com/package/@owlmeans/create-app) as a bare shell —
the wiring is complete and there is no example code to delete.

## Workspaces

```
sources/
├── common/   # shared entrypoints (routes) and config — used by api AND web
├── api/      # @owlmeans/server-app backend
└── web/      # @owlmeans/web-panel + shadcn UI: navigation, layout and screens
```

## Develop

```sh
bun install
bun run dev
```

- API: http://localhost:3000
- Web: http://localhost:3001

> **Note:** The API runs over plain HTTP in dev (`cfg.security = { unsecure: true }` in
> `sources/common/src/config.ts`). If you edit `sources/common`, restart `bun run dev` to
> rebuild it before the API and web pick up the changes.

## Adding your first feature

1. **`sources/common/src/entrypoints.ts`** — declare the route as an OwlMeans *entrypoint* and
   give it an AJV filter. Both sides import this one declaration; neither re-declares the route.
2. **`sources/api`** — register a resource in `src/context.ts` (widening `Context` in
   `src/types.ts`), then `elevate()` the entrypoint with a handler in `src/entrypoints.ts`.
3. **`sources/web`** — add a screen under `src/screens`, hang it off a frontend route in
   `src/entrypoints.ts`, list it in `src/nav.ts`, and call the backend with
   `context.entrypoint(alias).call({ params, body })`.

See the [OwlMeans getting-started guide](https://github.com/owlmeans/common/blob/main/docs/getting-started.md)
for a worked example of all three steps.

## Agent guidance

This project ships agent context in `AGENTS.md` and a `CLAUDE.md` bridge, with skills in
`.agents/skills/` and a shared memory store at `.agents/memory/`.

Files carrying an `AUTO-GENERATED` banner are managed by
[`@owlmeans/agent-skills`](https://www.npmjs.com/package/@owlmeans/agent-skills) — don't hand-edit
them; write your own guidance as separate, un-bannered files. Refresh after adding or upgrading
`@owlmeans/*` packages:

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.11
```
