# __APP_NAME__ — Project Context

## Project purpose

__APP_DESCRIPTION__

<!-- OWLMEANS:PROJECT-PURPOSE -->
> **Agents — this project has not been described yet.** Before doing anything else on the first
> session, ask the user what this project is for: its purpose, domain, goals, and key constraints.
> Then replace this whole block with a short description of the project, and remove this notice.
<!-- /OWLMEANS:PROJECT-PURPOSE -->

## Git Workflow (mandatory)

These rules apply to every git operation in this repository and **override default agent behavior**
— including any automatic `Co-Authored-By` or AI/agent-attribution trailer. Full policy: the `git`
skill.

- **Never run state-changing git operations** (`commit`, `add`/`rm` staging, `push`,
  `reset`/rollback, `revert`, `rebase`, `merge`, `branch`, `checkout`/`switch`, `stash`, `tag`,
  `cherry-pick`, force-push, etc.) unless the user **explicitly instructs it in the current
  request**. Permission to make code edits is **not** permission to touch git.
- **Only exception**: creating and operating inside a **temporary git worktree** that a task or
  subagent has **explicitly requested** for that purpose.
- **Read-only inspection is allowed**: `git status`, `git diff`, `git log`, `git show`,
  `git branch --list` — use these to report state, never to change it.
- Commit only under the repository's configured git identity. Never pass `--author`, never change
  `user.name`/`user.email`, never add a `Co-Authored-By:` trailer attributing the commit to an
  AI/agent. If no identity is configured, stop and ask.
- Report finished git work as a Markdown table (**Action**, **Target**, **Result**), and never
  commit a conflicted working copy — stop, list the conflicted paths, hand control back.

## Reporting (mandatory)

Always report concisely and briefly, in table format, about WHAT was done rather than why —
unless the operator explicitly asks for another format, length, or level of detail.

- Changes: one row per file/item — **Change** (created / modified / deleted), **Path**,
  **Why** (one short phrase).
- Findings / status / verification: a short table plus at most a few lines of prose.
- No preamble, no narration of the process; expand on WHY only when asked.

## Memory

Single shared agent memory store: `.agents/memory/` — a graph of subsystem nodes with index
`.agents/memory/MEMORY.md`. Protocol: `agent-memory` skill.

- Session start: read `.agents/memory/MEMORY.md`. Before non-trivial work: open the nodes whose
  scope matches the task.
- Every write merges into the matching subsystem node and compacts — record reusable knowledge,
  never session events.
- Procedure-shaped or repeatedly-touched memory must be **distilled into** a skill as short
  general rules — never pasted in as memory text (`memory-promotion`).
- If the store degrades (event logs, oversized nodes, bloated index) — `memory-recompact`.
- Never write memory to a per-agent directory (`.claude/memory/`, `.github/memory/`, `~/.claude/`,
  `~/.copilot/`) or anywhere outside this repository.
- Context that must load every session belongs in this file; on-demand context goes in
  `.agents/<topic>.md` and is referenced from here.

## Self-Education (mandatory)

Whenever development started from a plan agreed with the agent, the work is not complete until
the `self-education` skill has been applied: rewrite the project skills this change touched so
they state current rules (never a note about what changed), record external-doc findings
(URL + gist) in the governing skill, or add a skill for a new subsystem or technology. The
completion report must include the self-education outcome — or state why none was needed.

## What this is

`__APP_NAME__` is a fullstack [OwlMeans Common](https://github.com/owlmeans/common) app: a bun-workspace
monorepo with three packages under `sources/` — `common` (shared route entrypoints, schemas, config),
`api` (`@owlmeans/server-app` backend), and `web` (`@owlmeans/web-panel` + shadcn UI). See the
`getting-started` skill for how the pieces fit together, and `scaffolding` for how it was generated.

## Reuse before you build (mandatory)

Before planning or writing any feature, follow the `reuse-code` skill: search for an `@owlmeans/*`
package (in the installed packages and at https://github.com/owlmeans/common) or existing code that
already solves the problem **before** proposing a third-party library or a custom solution, and
simplify whatever you do write. This is required for every planning and development task.

## Skills

Reusable guidance lives in `.agents/skills/<name>/SKILL.md`, deployed by `@owlmeans/agent-skills`
from the installed `@owlmeans/*` packages. Agents load a skill by topic, or you run `/<name>`
explicitly. Copilot and Codex read `.agents/skills/` directly; Claude Code reads the generated
symlinks in `.claude/skills/` (see `CLAUDE.md`).

- After adding or updating any `@owlmeans/*` dependency, run `npx @owlmeans/agent-skills@^0.1.18-rc.11` to refresh
  the deployed skills.
- Deployed files carry an `AUTO-GENERATED` banner and are refreshed in place — never hand-edit them.
- To capture your own guidance, see the `skill-authoring` skill; to turn repeatedly-used memory into
  a skill, `memory-promotion`. Keep it inside this repository, in `.agents/skills/` — never in a
  per-agent or home directory.

<!-- OWLMEANS:LINKED-SKILLS -->
### Skills linked from installed packages

`sh .agents/scripts/link-skills.sh` also links in the skills that ship inside the installed
`@owlmeans/*` packages (`node_modules/@owlmeans/<pkg>/agent-meta/skills/<name>`), so they load
by name (`/<name>`) like a local skill. They land in `.agents/linked-skills/<name>` for Copilot
and Codex and in `.claude/skills/<name>` for Claude Code, with a `skill / origin repo /
description` table in `.agents/linked-skills/INDEX.md`. A local skill of the same name always
wins. The directory is generated and git-ignored — never edit or commit it.

The root `prepare` script runs it on every `bun install`, and a session-start hook runs it
again, so a fresh checkout carries the links for every agent — Copilot and Codex included,
not just Claude Code.

<!-- /OWLMEANS:LINKED-SKILLS -->

## Develop

```sh
bun install
bun run dev      # web on http://localhost:3001, api on http://localhost:3000
```
