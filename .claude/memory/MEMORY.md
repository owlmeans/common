# Memory Index

Read this at the start of every conversation. Load files relevant to the current task before acting.

## Always relevant
- Project structure, architecture, layers, memory rules → already in `CLAUDE.md`

## Skills (auto-invoked by Claude based on context, or `/skill-name`)
- [bun](./../skills/bun/SKILL.md) — Bun package manager & build; auto-invoked for install/build/script tasks
- [create-skill](./../skills/create-skill/SKILL.md) — How to create Claude Code skills; use when asked to add a skill

## How to add new memory
- Facts, decisions, gotchas → `.claude/memory/<topic>.md` + update this index
- Reusable procedures or reference → `.claude/skills/<name>/SKILL.md` + update this index
