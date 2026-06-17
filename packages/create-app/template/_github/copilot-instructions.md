# __APP_NAME__ — GitHub Copilot Project Context

## Project purpose

<!-- OWLMEANS:PROJECT-PURPOSE -->
> **Agents — this project has not been described yet.** Before doing anything else on the first
> session, ask the user what this project is for: its purpose, domain, goals, and key constraints.
> Then replace this whole block — in **both** `.github/copilot-instructions.md` and `CLAUDE.md` — with
> a short description of the project, and remove this notice.

## What this is

`__APP_NAME__` is a fullstack [OwlMeans Common](https://github.com/owlmeans/common) app: a bun-workspace
monorepo with three packages under `sources/` — `common` (shared route entrypoints, schemas, config),
`api` (`@owlmeans/server-app` backend), and `web` (`@owlmeans/web-panel` + shadcn UI). See the
`getting-started.instructions.md` for how the pieces fit together.

## Reuse before you build (mandatory)

Before planning or writing any feature, follow `reuse-code.instructions.md`: search for an
`@owlmeans/*` package (in the installed packages and at https://github.com/owlmeans/common) or existing
code that already solves the problem **before** proposing a third-party library or a custom solution,
and simplify whatever you do write. This is required for every planning and development task.

## Memory & Meta-file Rules

All project memory and meta-information lives **inside this project**, never in `~/.copilot/`:

- **Always** write new memory files to `.github/memory/` in this project root.
- **Always** update `.github/memory/MEMORY.md` when adding a memory file.
- **Never** write project memory outside the repository.
- Context that should load every session goes in `.github/copilot-instructions.md`; on-demand context
  goes in `.github/instructions/<topic>.instructions.md`.
- When asked to remember something about this project, save it to `.github/memory/<topic>.md` and
  update the index. See `agent-memory.instructions.md`.

### When to read memory

- **At the start of every session**: read `.github/memory/MEMORY.md`, then any relevant file.
- **Before a non-trivial task**: read the relevant memory or instruction first.
- **After completing a task** that produced new knowledge: save it to memory.

## Instructions

Reusable guidance lives in `.github/instructions/<name>.instructions.md`, deployed by
`@owlmeans/agent-skills` from the installed `@owlmeans/*` packages and auto-attached by `applyTo`.

- After adding or updating any `@owlmeans/*` dependency, run `npx @owlmeans/agent-skills` to refresh
  the deployed skills and instructions.
- To capture your own guidance, see `skill-authoring.instructions.md`.

## Develop

```sh
bun install
bun run dev      # web on http://localhost:3001, api on http://localhost:3000
```
