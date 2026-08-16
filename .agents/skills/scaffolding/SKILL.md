---
name: scaffolding
description: How to scaffold a new OwlMeans Common project — the @owlmeans/create-app CLI (npm/bun/yarn create), its flags, what it generates, and the manual alternative. Use when asked to create/bootstrap/start a new OwlMeans app or set up a fresh project.
user-invocable: true
metadata:
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
guidance** into the project via [[bun]]-installed `@owlmeans/agent-skills` (`.agents/skills/`).
With `--no-install` the deploy still runs — the installer's own bundled
extras give the project its general/harness guidance; only the package-specific skills wait for
`npx @owlmeans/agent-skills` after the install.

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
├── AGENTS.md               # git/reporting/memory/self-education rules + project-purpose placeholder
├── CLAUDE.md               # thin bridge: imports AGENTS.md, documents the skill symlinks
├── .agents/skills/         # seeded harness skills (+ deployed ones)
├── .agents/scripts/link-skills.sh  # refreshes the .claude/skills symlinks Claude Code needs
├── .agents/memory/MEMORY.md      # starter shared memory graph index
├── sources/common/         # consts, types, schemas, config, modules (entrypoints)
├── sources/api/            # context.ts (appendStaticResource), app/session/*, modules.ts, index.ts
└── sources/web/            # vite + tailwind v4, components/ui/*, layout, nav, screens, render.tsx
```

Memory lives **only** in `.agents/memory/` — the legacy `.claude/memory/` and `.github/memory/`
starters are gone (see [[agent-memory]]; [[memory-recompact]] migrates a project that still has them).

**Routing is OwlMeans-native.** The generated app has no `react-router` dependency and no
`react-router` override: `makeContext` registers `@owlmeans/web-router` and `PanelApp` resolves
its compiler from the active plugin, so `render.tsx` passes no `provide` prop. Layouts take
`children` — the renderer supplies the plugin's `Outlet` — and navigation is `useNavigate()` from
`@owlmeans/web-panel`. An app that genuinely wants react-router opts in per [[router-plugins]];
never re-add it to the template.

The session demo stores items in `@owlmeans/static-resource`, namespaced by a client-generated
`sid` kept in `localStorage` — no database, no authentication. See [[static-resource]],
[[server-app]], [[web-panel]].

## Generated agent guidance

`AGENTS.md` carries the same four mandatory sections as a real OwlMeans monorepo — **Git
Workflow**, **Reporting**, **Memory** (the `.agents/memory/` graph store), **Self-Education** —
plus the mandatory [[reuse-code]] section and a **project-purpose placeholder**
(`<!-- OWLMEANS:PROJECT-PURPOSE -->`). On the first agent session that block instructs the agent to
ask the user what the project is for and replace it. `CLAUDE.md` is a thin bridge that imports
`AGENTS.md` and keeps the gitignored `.claude/skills/` symlinks fresh through a `SessionStart`
hook; Copilot and Codex need nothing beyond `AGENTS.md` and `.agents/skills/`.

The harness guidance is **seeded into the template** as generated, banner-carrying copies, so a
project has it even before the installer runs: [[agent-memory]], [[memory-promotion]],
[[memory-recompact]], [[self-education]], [[skill-authoring]], `git`, [[reuse-code]],
[[getting-started]]. Regenerate the seed with `sync-agent-meta --seed-only` in the library-manager;
never hand-edit a seeded copy. The installer adds the remaining general skills
([[scaffolding]], [[router-plugins]], [[shadcn-web]], [[shadcn-versions]]) and every
package-specific one. After adding any `@owlmeans/*` dependency, re-run `npx @owlmeans/agent-skills`
— discovery scans **every** `node_modules/@owlmeans` in the workspace (root and nested under
`sources/*`), so package-specific skills are picked up even though bun nests them.
