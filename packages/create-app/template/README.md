# __APP_NAME__

__APP_DESCRIPTION__

A minimal fullstack [OwlMeans Common](https://github.com/owlmeans/common) app, scaffolded with
[`@owlmeans/create-app`](https://www.npmjs.com/package/@owlmeans/create-app).

No authentication; session data lives in an **in-memory static resource** on the backend.

## Workspaces

```
sources/
├── common/   # shared entrypoints (routes), schemas and types — used by api AND web
├── api/      # @owlmeans/server-app backend; session items in @owlmeans/static-resource
└── web/      # @owlmeans/web-panel + shadcn UI: navigation, layout and screens
```

## Develop

```sh
bun install
bun run dev
```

- API: http://localhost:3000
- Web: http://localhost:3001

Open the **Session** page and add/remove items — they are stored per browser session
(a `sid` kept in `localStorage`) in an in-memory resource on the API. Restarting the API
clears them; opening a different browser/incognito window gets an isolated session.

> **Note:** The API runs over plain HTTP in dev (`cfg.security = { unsecure: true }` in
> `sources/common/src/config.ts`). If you edit `sources/common`, restart `bun run dev` to
> rebuild it before the API and web pick up the changes.

## How it fits together

1. **`sources/common`** declares the API routes as OwlMeans *entrypoints* (`session.list`,
   `session.add`, `session.remove`) plus their AJV schemas and shared types.
2. **`sources/api`** registers a `@owlmeans/static-resource` in its context and `elevate()`s
   each entrypoint with a handler that does CRUD against it, keyed by the session id.
3. **`sources/web`** `elevate()`s the same entrypoints to screen components and calls them with
   `context.entrypoint(alias).call({ params, body })`.

See [OwlMeans getting-started guide](https://github.com/owlmeans/common/blob/main/docs/getting-started.md)
for a full walkthrough and the manual (non-scaffolded) version of this project.

## Agent guidance

This project ships agent context in `CLAUDE.md` and `.github/copilot-instructions.md`. Both carry the
same four mandatory sections a real OwlMeans monorepo uses — **Git Workflow**, **Reporting**,
**Memory**, **Self-Education** — plus a project-purpose placeholder the agent fills in on its first
session.

Project memory is a single shared graph store at `.agents/memory/` (index `MEMORY.md`), used by both
Claude Code and Copilot — never write memory anywhere else.

Reusable guidance lives in `.claude/skills/` (Claude Code) and `.github/instructions/` (Copilot).
Files carrying an `AUTO-GENERATED` banner are managed by
[`@owlmeans/agent-skills`](https://www.npmjs.com/package/@owlmeans/agent-skills) — don't hand-edit
them; write your own guidance as separate, un-bannered files. Refresh after adding or upgrading
`@owlmeans/*` packages:

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.11
```
