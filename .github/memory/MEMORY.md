# Memory Index

Read this at the start of every conversation. Load files relevant to the current task before acting.

## Always relevant
- Project structure, architecture, layers, memory rules → already in `.github/copilot-instructions.md`

## Instructions (load based on task)
- [bun](./../instructions/bun.instructions.md) — Bun package manager & build; use for install/build/script tasks
- [versions](./../instructions/versions.instructions.md) — Versioning conventions; use when bumping versions or checking internal dep patterns
- [tsconfig](./../instructions/tsconfig.instructions.md) — TypeScript config setup; use when creating packages or editing tsconfigs
- [create-skill](./../instructions/create-skill.instructions.md) — How to create Copilot instruction files

## Project facts
- **versioning** — All ~71 packages synchronized at `0.1.2`; internal deps use `^0.1.2`; `dep-config` is always `workspace:*`
- **native packages** — Moved to the `native` monorepo; consumed from there via library links

## How to add new memory
- Facts, decisions, gotchas → `.github/memory/<topic>.md` + update this index
- Reusable procedures or reference → `.github/instructions/<name>.instructions.md` + update this index
