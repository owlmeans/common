# __APP_NAME__ — Project Context

## Project purpose

<!-- OWLMEANS:PROJECT-PURPOSE -->
> **Agents — this project has not been described yet.** Before doing anything else on the first
> session, ask the user what this project is for: its purpose, domain, goals, and key constraints.
> Then replace this whole block — in **both** `CLAUDE.md` and `.github/copilot-instructions.md` — with
> a short description of the project, and remove this notice.

## What this is

`__APP_NAME__` is a fullstack [OwlMeans Common](https://github.com/owlmeans/common) app: a bun-workspace
monorepo with three packages under `sources/` — `common` (shared route entrypoints, schemas, config),
`api` (`@owlmeans/server-app` backend), and `web` (`@owlmeans/web-panel` + shadcn UI). See the
`getting-started` skill for how the pieces fit together.

## Memory & Meta-file Rules

All project memory and meta-information lives **inside this project**, never in `~/.claude/`:

- **Always** write new memory files to `.claude/memory/` in this project root.
- **Always** update `.claude/memory/MEMORY.md` when adding a memory file.
- **Never** write project memory to `~/.claude/`.
- Context that should load every session goes in `CLAUDE.md`; on-demand context goes in
  `.claude/<topic>.md` and is referenced from here.
- When asked to remember something about this project, save it to `.claude/memory/<topic>.md` and
  update the index. See the `agent-memory` skill.

### When to read memory

- **At the start of every session**: read `.claude/memory/MEMORY.md`, then any relevant file.
- **Before a non-trivial task**: read the relevant memory or `.claude/<topic>.md` first.
- **After completing a task** that produced new knowledge: save it to memory.

## Skills

Reusable guidance lives in `.claude/skills/<name>/SKILL.md`, deployed by `@owlmeans/agent-skills` from
the installed `@owlmeans/*` packages. Claude auto-invokes them by topic, or run `/<name>` explicitly.

- After adding or updating any `@owlmeans/*` dependency, run `npx @owlmeans/agent-skills` to refresh
  the deployed skills and instructions.
- To capture your own guidance, see the `skill-authoring` skill.

## Develop

```sh
bun install
bun run dev      # web on http://localhost:3001, api on http://localhost:3000
```
