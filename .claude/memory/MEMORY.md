# Memory Index

Read this at the start of every conversation. Load files relevant to the current task before acting.

## Always relevant
- Project structure, architecture, layers, memory rules → already in `CLAUDE.md`

## Skills (auto-invoked by Claude based on context, or `/skill-name`)
- [bun](./../skills/bun/SKILL.md) — Bun package manager & build; auto-invoked for install/build/script tasks
- [create-skill](./../skills/create-skill/SKILL.md) — How to create Claude Code skills; use when asked to add a skill
- [versions](./../skills/versions/SKILL.md) — Versioning conventions; use when bumping versions or checking internal dep patterns
- [tsconfig](./../skills/tsconfig/SKILL.md) — TypeScript config setup; use when creating packages or editing tsconfigs
- [testing-overview](./../skills/testing-overview/SKILL.md) — Decision matrix + eight invariants; auto-invoked when "tests" or "testing" comes up
- [testing-unit](./../skills/testing-unit/SKILL.md) — Category-A unit tests (no mocks)
- [testing-auth-unit](./../skills/testing-auth-unit/SKILL.md) — Category-B unit tests using `@owlmeans/test-auth` mocks
- [testing-integration](./../skills/testing-integration/SKILL.md) — Category-C env-gated integration tests
- [testing-ui](./../skills/testing-ui/SKILL.md) — Category-D Playwright acceptance tests (covers MUI legacy and shadcn + Tailwind packages)
- [shadcn-web](./../skills/shadcn-web/SKILL.md) — Development & maintenance of shadcn UI + Tailwind v4 web packages; the `@` alias contract
- [shadcn-versions](./../skills/shadcn-versions/SKILL.md) — Bumping tailwind/shadcn external deps; re-syncing copied primitives
- [auth-protocol](./../skills/auth-protocol/SKILL.md) — Comprehensive OwlMeans auth protocol reference (Ed25519 + OIDC + local identity paths, types, errors, mocking points)
- [server-auth-identity](./../skills/server-auth-identity/SKILL.md) — Mongo identity resources, linking service, provider account linking; auto-invoked for identity resource work
- [dependency-tree](./../skills/dependency-tree/SKILL.md) — Pointer to `tree.md` (per-package `@owlmeans/*` deps, layer assignments, build order, known SCCs)

## Project facts
- [versioning](./versioning.md) — Synchronized version convention, internal dep refs, dep-config as workspace:*
- [auth-viable-usage](./auth-viable-usage.md) — How product-viable uses common auth/OIDC packages and local identity gates
- [shadcn-ui-strategy](./shadcn-ui-strategy.md) — Three durable decisions: no registries, `@` app-provides-at-integration, wrap client-panel

## How to add new memory
- Facts, decisions, gotchas → `.claude/memory/<topic>.md` + update this index
- Reusable procedures or reference → `.claude/skills/<name>/SKILL.md` + update this index
