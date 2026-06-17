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
- [oidc-versions](./../skills/oidc-versions/SKILL.md) — OIDC/OAuth dependency version management: exact-pin policy, lib checklists, isolation principle, downstream verification
- [server-auth-identity](./../skills/server-auth-identity/SKILL.md) — Mongo identity resources, linking service, provider account linking; auto-invoked for identity resource work
- [dependency-tree](./../skills/dependency-tree/SKILL.md) — Pointer to `tree.md` (per-package `@owlmeans/*` deps, layer assignments, build order, known SCCs)
- [getting-started](./../skills/getting-started/SKILL.md) — Fullstack app shape (common/api/web, context bootstrap, shared entrypoints + elevate, static-resource sessions, shadcn web); points to `docs/getting-started.md`. Ships as an `@owlmeans/agent-skills` extra.
- [scaffolding](./../skills/scaffolding/SKILL.md) — How to scaffold a new project via `@owlmeans/create-app` (npm/bun/yarn create) or manually. Ships as an `@owlmeans/agent-skills` extra.
- [skill-authoring](./../skills/skill-authoring/SKILL.md) — Generic guide to authoring skills + Copilot instructions in any OwlMeans project. `scope: general`, ships as an `@owlmeans/agent-skills` extra.
- [agent-memory](./../skills/agent-memory/SKILL.md) — Generic project-memory directive (where memory lives per tool, MEMORY.md index, when to read/write). `scope: general`, ships as an `@owlmeans/agent-skills` extra.
- [reuse-code](./../skills/reuse-code/SKILL.md) — Mandatory discovery-first/reuse-first workflow: find an `@owlmeans/*` package or existing code before proposing libraries/custom solutions (local research when symlinked, GitHub otherwise), extend before writing new, simplify. `scope: general`, ships as an `@owlmeans/agent-skills` extra.

## Project facts
- [entrypoint-rename](./entrypoint-rename.md) — Module→Entrypoint rename: new canonical packages, deprecated shims, marker interop, context method renames, phase status
- [versioning](./versioning.md) — Synchronized version convention, internal dep refs, dep-config as workspace:*
- [auth-viable-usage](./auth-viable-usage.md) — How product-viable uses common auth/OIDC packages and local identity gates
- [shadcn-ui-strategy](./shadcn-ui-strategy.md) — Three durable decisions: no registries, `@` app-provides-at-integration, wrap client-panel
- [oidc-deps](./oidc-deps.md) — Exact-pinned OIDC lib versions, two critical gotchas (v9 middleware + jose extractable), isolation principle, downstream symlinks
- [sync-agent-meta-gotchas](./sync-agent-meta-gotchas.md) — library-manager sync script sharp edges: `--filter` is destructive (prunes non-matching agent-meta); README marker side effect; how to add an agent-skills installer extra surgically

## How to add new memory
- Facts, decisions, gotchas → `.claude/memory/<topic>.md` + update this index
- Reusable procedures or reference → `.claude/skills/<name>/SKILL.md` + update this index
