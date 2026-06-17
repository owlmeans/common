---
name: scaffolding
description: How to scaffold a new OwlMeans Common project — the @owlmeans/create-app CLI (npm/bun/yarn create), its flags, what it generates, and the manual alternative. Use when asked to create/bootstrap/start a new OwlMeans app or set up a fresh project.
user-invocable: true
scope: general
---

# Scaffolding a new OwlMeans Common project

Two paths produce the same minimal fullstack project (`common` + `api` + `web`, shadcn UI
navigation/layout, **no auth**, a **session-scoped in-memory resource**). The full reference is
[`docs/getting-started.md`](../../../docs/getting-started.md); the framework shape is [[getting-started]].

## Path 1 — `@owlmeans/create-app` (one command)

```sh
npm create @owlmeans/app@latest my-app
bun create @owlmeans/app my-app
yarn create @owlmeans/app my-app
npx @owlmeans/create-app my-app
```

By default it copies the template, runs `git init`, installs dependencies, and **deploys agent
guidance** into the project via [[bun]]-installed `@owlmeans/agent-skills` (`.claude/skills/` +
`.github/instructions/`).

Flags: `--name <name>`, `--pm <bun|npm|yarn>` (default `bun`), `--no-install`, `--no-skills`,
`--no-git`, `--yes`/`-y`, `--help`.

Then run:

```sh
cd my-app && bun run dev      # API :3000, web :3001
```

**When an agent should use this:** the user asks to start/bootstrap/create a new OwlMeans app from
nothing. Prefer it over hand-writing boilerplate. After it runs, point the user at the **Session**
screen and `docs/getting-started.md`.

## Path 2 — manual

Follow **Option B** in [`docs/getting-started.md`](../../../docs/getting-started.md): create the bun
workspace, then `common` (shared entrypoints/schemas/config), `api` (`@owlmeans/server-app` +
`appendStaticResource` handlers + `main`), and `web` (`@owlmeans/web-panel` + shadcn `@`-provided
primitives + layout/nav/screens). Finish with `npx @owlmeans/agent-skills` to add agent guidance.

## What gets generated

```
my-app/
├── package.json            # bun workspaces: sources/*
├── sources/common/         # consts, types, schemas, config, modules (entrypoints)
├── sources/api/            # context.ts (appendStaticResource), app/session/*, modules.ts, index.ts
└── sources/web/            # vite + tailwind v4, components/ui/*, layout, nav, screens, render.tsx
```

The session demo stores items in `@owlmeans/static-resource`, namespaced by a client-generated
`sid` kept in `localStorage` — no database, no authentication. See [[static-resource]],
[[server-app]], [[web-panel]].
