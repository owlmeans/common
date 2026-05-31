# Memory Index

Read this at the start of every conversation. Load files relevant to the current task before acting.

## Always relevant
- Project structure, architecture, layers, memory rules → already in `.github/copilot-instructions.md`

## Instructions (load based on task)
- [shadcn-web](./../instructions/shadcn-web.instructions.md) — Development & maintenance of shadcn UI + Tailwind v4 web packages; the `@` alias contract
- [shadcn-versions](./../instructions/shadcn-versions.instructions.md) — Bumping tailwind/shadcn external deps; re-syncing copied primitives
- [bun](./../instructions/bun.instructions.md) — Bun package manager & build; use for install/build/script tasks
- [versions](./../instructions/versions.instructions.md) — Versioning conventions; use when bumping versions or checking internal dep patterns
- [tsconfig](./../instructions/tsconfig.instructions.md) — TypeScript config setup; use when creating packages or editing tsconfigs
- [create-skill](./../instructions/create-skill.instructions.md) — How to create Copilot instruction files
- [auth-protocol](./../instructions/auth-protocol.instructions.md) — Auth protocol rules including provider-backed local identity and non-destructive identity reads
- [server-auth-identity](./../instructions/server-auth-identity.instructions.md) — Mongo identity resources, linking service, provider account linking

## Project facts
- **versioning** — All ~71 packages synchronized at `0.1.2`; internal deps use `^0.1.2`; `dep-config` is always `workspace:*`
- **native packages** — Moved to the `native` monorepo; consumed from there via library links
- [auth-viable-usage](./auth-viable-usage.md) — How product-viable uses common auth/OIDC packages and local identity gates
- [shadcn-ui-strategy](./shadcn-ui-strategy.md) — Three durable decisions: no registries, `@` app-provides-at-integration, wrap client-panel

## How to add new memory
- Facts, decisions, gotchas → `.github/memory/<topic>.md` + update this index
- Reusable procedures or reference → `.github/instructions/<name>.instructions.md` + update this index
