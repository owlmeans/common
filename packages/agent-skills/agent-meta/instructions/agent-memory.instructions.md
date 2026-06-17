---
description: "How project memory works in an OwlMeans app — where to store facts/decisions/gotchas for Copilot (.github/memory/) and Claude Code (.claude/memory/), the MEMORY.md index, and when to read/write memory. Apply when remembering something about the project or deciding where a note belongs."
applyTo: "**/.github/memory/**, **/.claude/memory/**"
scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Project memory

Memory is how durable, project-specific knowledge survives across sessions. Keep it **inside the
project**, never outside the repository.

| Tool | Memory dir | Index |
|---|---|---|
| GitHub Copilot | `.github/memory/` | `.github/memory/MEMORY.md` |
| Claude Code | `.claude/memory/` | `.claude/memory/MEMORY.md` |

Each memory is one Markdown file holding one fact, decision, or gotcha. The `MEMORY.md` index keeps a
one-line pointer per file and is loaded every session, so keep it current.

## When to read

- **Start of every session** — read `MEMORY.md`, then open any relevant file.
- **Before a non-trivial task** — check for and read a memory file on that topic.

## When to write

After a task produces knowledge not obvious from the code or git history: a decision and its
rationale, a gotcha, or project state/goals. Do not record what the repo or git history already says,
or what only matters to the current conversation.

## How to write one

1. Create `.github/memory/<topic>.md` (and the Claude copy under `.claude/memory/`) with a short slug
   and a one-line description.
2. Write the single fact; for decisions/gotchas add why it matters and how to apply it.
3. Add a one-line pointer to `MEMORY.md`.
4. Update an existing file instead of duplicating; delete memories that prove wrong.

## Memory vs skill

A repeatable procedure is a skill (see the `skill-authoring` instruction). Memory is for facts about
this project.
