---
name: agent-memory
description: How project memory works in an OwlMeans app — where to store facts/decisions/gotchas for Claude Code (.claude/memory/) and Copilot (.github/memory/), the MEMORY.md index, and when to read and write memory. Use when asked to remember something about the project, or to decide where a note belongs.
user-invocable: true
scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Project memory

Memory is how durable, project-specific knowledge survives across sessions. Keep it **inside the
project**, never in `~/.claude/` or `~/.copilot/`.

| Tool | Memory dir | Index |
|---|---|---|
| Claude Code | `.claude/memory/` | `.claude/memory/MEMORY.md` |
| GitHub Copilot | `.github/memory/` | `.github/memory/MEMORY.md` |

Each memory is one Markdown file holding one fact, decision, or gotcha. The `MEMORY.md` index has a
one-line pointer per file (`- [Title](file.md) — hook`) and is loaded every session, so it must stay
current.

## When to read memory

- **At the start of every session** — read `MEMORY.md`, then open any file relevant to the task.
- **Before a non-trivial task** — check for a memory file on that topic and read it first.
- Don't rely on assumptions when a memory file exists; read it.

## When to write memory

After a task produces knowledge that isn't obvious from the code or git history:

- A **decision** and why it was made (and what was rejected).
- A **gotcha** or sharp edge discovered the hard way.
- **Project state / goals** not derivable from the repo.

Do **not** record what the code or git history already says, or what only matters to the current
conversation.

## How to write one

1. Create `.claude/memory/<topic>.md` (and the Copilot copy under `.github/memory/`) with a short
   slug name and a one-line description.
2. Write the single fact; for decisions/gotchas, add why it matters and how to apply it.
3. Add a one-line pointer to the matching `MEMORY.md` index.
4. Before saving, check for an existing file that already covers it — update that instead of
   duplicating. Delete memories that turn out to be wrong.

## Memory vs skill

If you are writing a **repeatable procedure** ("to do X, do Y"), that is a skill — see the
`skill-authoring` skill. Memory is for **facts about this project** ("we chose X because Y").
