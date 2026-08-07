---
description: "How to scaffold a new OwlMeans Common project — the @owlmeans/create-app CLI (npm/bun/yarn create), its flags and output, plus the manual alternative. Apply when creating or bootstrapping a fresh OwlMeans app."
applyTo: "**/package.json, **/README.md"
scope: general
---

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
guidance via `@owlmeans/agent-skills` (`.claude/skills/` + `.github/instructions/`). With
`--no-install` the deploy still runs from the installer's own bundled extras, so the project gets
its general/harness guidance; package-specific skills wait for `npx @owlmeans/agent-skills`.

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
├── CLAUDE.md               # git/reporting/memory/self-education rules + project-purpose placeholder
├── .github/copilot-instructions.md   # same directives for Copilot
├── .github/instructions/   # seeded harness instructions (+ deployed ones)
├── .claude/skills/         # seeded harness skills (+ deployed ones)
├── .agents/memory/MEMORY.md          # starter shared memory graph index (both tools)
├── sources/common/         # consts, types, schemas, config, modules
├── sources/api/            # context (appendStaticResource), app/session/*, modules, index
└── sources/web/            # vite + tailwind v4, components/ui/*, layout, nav, screens, render
```

Session items live in `@owlmeans/static-resource`, namespaced by a client-generated `sid` in
`localStorage` — no database, no authentication.

## Generated agent guidance

Both root files carry the same four mandatory sections as a real OwlMeans monorepo — Git Workflow,
Reporting, Memory, Self-Education — plus the mandatory reuse-code section and a project-purpose
placeholder (`<!-- OWLMEANS:PROJECT-PURPOSE -->`) the agent fills in on its first session.

Memory lives **only** in `.agents/memory/` — the legacy `.claude/memory/` and `.github/memory/`
starters are gone (`memory-recompact.instructions.md` migrates a project that still has them).

The harness guidance is seeded into the template as generated, banner-carrying copies, so a project
has it before the installer runs: `agent-memory`, `memory-promotion`, `memory-recompact`,
`self-education`, `skill-authoring`, `git`, `reuse-code`, `getting-started`. Never hand-edit a seeded
copy — regenerate with `sync-agent-meta --seed-only` in the library-manager.
