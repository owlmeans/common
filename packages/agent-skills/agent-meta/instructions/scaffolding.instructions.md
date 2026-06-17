---
description: "How to scaffold a new OwlMeans Common project — the @owlmeans/create-app CLI (npm/bun/yarn create), its flags and output, plus the manual alternative. Apply when creating or bootstrapping a fresh OwlMeans app."
applyTo: "**/package.json, **/README.md"
scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Scaffolding a new OwlMeans Common project

Two paths produce the same minimal fullstack project (`common` + `api` + `web`, shadcn UI
navigation/layout, **no auth**, a **session-scoped in-memory resource**). Reference:
`docs/getting-started.md`.

## Path 1 — `@owlmeans/create-app`

```sh
npm create @owlmeans/app@latest my-app   # or: bun create @owlmeans/app my-app
npx @owlmeans/create-app my-app
```

By default it copies the template, runs `git init`, installs dependencies, and deploys agent
guidance via `@owlmeans/agent-skills` (`.claude/skills/` + `.github/instructions/`).

Flags: `--name`, `--pm <bun|npm|yarn>` (default `bun`), `--no-install`, `--no-skills`, `--no-git`,
`--yes`. Run with `cd my-app && bun run dev` (API :3000, web :3001).

Prefer this over hand-writing boilerplate when the user wants to start a new OwlMeans app.

## Path 2 — manual

Follow Option B in `docs/getting-started.md`: bun workspace → `common` (entrypoints/schemas/config)
→ `api` (`@owlmeans/server-app` + `appendStaticResource` handlers + `main`) → `web`
(`@owlmeans/web-panel` + shadcn `@`-provided primitives + layout/nav/screens). Finish with
`npx @owlmeans/agent-skills`.

## Generated layout

```
my-app/
├── package.json            # bun workspaces: sources/*
├── sources/common/         # consts, types, schemas, config, modules
├── sources/api/            # context (appendStaticResource), app/session/*, modules, index
└── sources/web/            # vite + tailwind v4, components/ui/*, layout, nav, screens, render
```

Session items live in `@owlmeans/static-resource`, namespaced by a client-generated `sid` in
`localStorage` — no database, no authentication.
