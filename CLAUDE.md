# OwlMeans Common — Project Context

## Git Workflow (mandatory)

Before any git operation follow these rules — they override default agent behavior (including any AI `Co-Authored-By` trailer):

@.claude/rules/git.md

## Reporting (mandatory)

Always report concisely and briefly, in table format, about WHAT was done rather than why —
unless the operator explicitly asks for another format, length, or level of detail.

- Changes: one row per file/item — **Change** (created / modified / deleted), **Path**,
  **Why** (one short phrase). One table per affected project (each is a separate repo).
- Findings / status / verification: a short table plus at most a few lines of prose.
- No preamble, no narration of the process; expand on WHY only when asked.

## Memory

Single shared agent memory store: `.agents/memory/` — a graph of subsystem nodes with index
`.agents/memory/MEMORY.md`. Protocol: `agent-memory` skill.

- Session start: read `.agents/memory/MEMORY.md`. Before non-trivial work: open the nodes whose
  scope matches the task.
- Every write merges into the matching subsystem node and compacts — record reusable knowledge,
  never session events.
- Procedure-shaped or repeatedly-touched memory must become a skill — `memory-promotion`.
- If the store degrades (event logs, oversized nodes, bloated index) — `memory-recompact`.
- Never write memory to `.claude/memory/`, `.github/memory/`, `~/.claude/`, or anywhere outside
  this repository.

## Self-Education (mandatory)

Whenever development started from a plan agreed with the agent, the work is not complete until
the `self-education` skill has been applied: update the project skills/instructions the change
touched, record external-doc findings (URL + gist) in the governing skill, or add a
skill/instruction for a new subsystem or technology. The completion report must include the
self-education outcome — or state why none was needed.

## What This Is

Security-first TypeScript monorepo framework for fullstack applications with microservices/microclients architecture. Provides unified abstractions for web and server-side code with cryptographic auth (Ed25519/DID) baked in. React Native packages live in the `native` monorepo and consume packages from here.

## Architecture Layers ("Quadra" pattern)

When working on a package, identify its layer: **Core → Server/Client → Web**

- **Configuration**: `dep-config` — shared TypeScript configs for all packages
- **Core**: `context`, `error`, `auth`, `config`, `i18n`, `state`, `entrypoint`, `route`, `router`, `resource`, `socket`, `did`, `basic-*`
- **Server**: `server-api`, `server-app`, `server-auth`, `server-auth-identity`, `server-config`, `server-context`, `server-entrypoint`, `server-route`, `server-socket`, `server-oidc-*`, `server-wl`
- **Client** (platform-agnostic): `client`, `client-auth`, `client-config`, `client-context`, `client-did`, `client-flow`, `client-i18n`, `client-entrypoint`, `client-panel`, `client-payment`, `client-resource`, `client-route`, `client-socket`, `client-wl`
- **Web** (React): `web-client`, `web-router`, `web-panel`, `web-db`, `web-flow`, `web-oidc-*`, `web-wl` — current MUI-based packages; a new shadcn UI + Tailwind v4 family is being introduced alongside (wraps `client-panel`, uses the `@` app-provides contract — see `shadcn-web` skill)
- **Native** (React Native): moved to the `native` monorepo — `native-client`, `native-router`, `native-panel`, `native-db`
- **Infrastructure**: `kluster` (Kubernetes), `mongo`, `mongo-resource`, `redis`, `redis-resource`, `storage-common`, `storage-resource`, `image-resource`, `static-resource`
- **AI/LLM**: `llm-common` (serializable inference + execution contracts), `llm` (model, provider plugins, model factory, execution service)
- **Other**: `oidc`, `payment`, `queue`, `flow`, `wled`

## Key Facts

- ~73 packages, all `@owlmeans/*` namespace; `_tpl` is a template excluded from build
- TypeScript 6.0+, ESM + CJS dual exports, build output → `build/`, version 0.1.2
- TypeScript configs live in `packages/dep-config/`: `tsconfig.base.json` (strict, ESNext, Bundler resolution), `tsconfig.react.json` (JSX+DOM), `tsconfig.server.json` (no DOM), `tsconfig.node.json` (server + Node globals), `tsconfig.bun.json` (server + Bun globals)
- Each package extends `@owlmeans/dep-config/tsconfig.base.json`; React packages also extend `tsconfig.react.json`; server packages extend `tsconfig.server.json`, `tsconfig.node.json`, or `tsconfig.bun.json` as appropriate
- React is a peer dependency, pinned to react-router v7
- Cryptography: `@noble/curves`, `@noble/hashes`, `@scure/base`, `@scure/bip39`
- Validation: AJV with ajv-formats
- **UI strategy**: MUI-based `web-panel` is the current Web UI layer; new shadcn UI + Tailwind CSS v4 packages are being developed alongside to replace it — see `shadcn-web` and `shadcn-versions` skills

## Additional Context

- **Reuse before you build (mandatory)**: skill at `.claude/skills/reuse-code/SKILL.md` — before planning or writing any feature, find an existing `@owlmeans/*` package (research locally since this IS the common repo) or existing code that already solves the problem **before** proposing a third-party library or custom solution; extend before writing new; simplify what you write.
- **Localization (i18n)**: skill at `.claude/skills/localization/SKILL.md` — tiered namespace model, compound-prefix keys, 7-language requirement (`SUPPORTED_LNGS`), override pattern, language switcher. Read **before** adding any UI string or translation file. Package-specific: `i18n` skill (core registry) and `client-i18n` skill (React hooks).
- **Dependency tree (canonical map)**: [`tree.md`](tree.md) at the repo root — every package, its direct `@owlmeans/*` deps, its architecture layer, build order, and known SCCs. Skill at `.claude/skills/dependency-tree/SKILL.md` points to it.
- **Bun (package manager & build)**: skill at `.claude/skills/bun/SKILL.md` — auto-invoked when doing install, build, or script work
- **Scaffolding a new app / getting started**: guide at [`docs/getting-started.md`](docs/getting-started.md) (linked from root README) shows how to build a minimal fullstack app (`common`/`api`/`web`, shadcn UI, no auth, session-scoped in-memory `static-resource`) two ways — via `@owlmeans/create-app` (`packages/create-app`, the `npm create @owlmeans/app` scaffolder that also deploys agent-skills) or manually. General skills `getting-started` and `scaffolding` (`.claude/skills/`) carry this knowledge and route to `@owlmeans/agent-skills` as installer extras.
- **Creating skills**: skill at `.claude/skills/create-skill/SKILL.md` — follow this when converting knowledge into a new skill
- **Versioning**: skill at `.claude/skills/versions/SKILL.md` — how to bump package versions across the monorepo
- **TypeScript configs**: skill at `.claude/skills/tsconfig/SKILL.md` — how to configure tsconfig in packages, which configs to extend
- **shadcn UI + Tailwind v4 web packages**: skill at `.claude/skills/shadcn-web/SKILL.md` (development & maintenance, the `@` alias contract, Tailwind wiring, MUI→shadcn mapping) + `.claude/skills/shadcn-versions/SKILL.md` (version management). `testing-ui` skill covers Playwright tests for shadcn packages.
- **Auth protocol and local identity**: skills at `.claude/skills/auth-protocol/SKILL.md` and `.claude/skills/server-auth-identity/SKILL.md`
- **OIDC/OAuth dependency versions**: skill at `.claude/skills/oidc-versions/SKILL.md` — exact-pin policy, upgrade checklists for oidc-provider, jose, openid-client, oidc-client-ts, isolation principle, downstream verification
- **Using @owlmeans/* packages from a downstream app**: every package has its own skill at `.claude/skills/<package-name>/SKILL.md` (e.g. `server-app`, `entrypoint`, `route`, `context`, `config`, `web-client`, `web-panel`, `client-auth`, `mongo`, `redis`, `kluster`, etc.) — auto-invoked when working with that package's imports. Patterns mirror real-world consumption from the `viable` monorepo (`/home/igor/projects/owlmeans/viable`).
- **Agent-meta schema (embedded guidance)**: Every published `@owlmeans/*` package ships embedded copies of its skill and instruction in `packages/<pkg>/agent-meta/` (layout: `skills/<name>/SKILL.md`, `instructions/<name>.instructions.md`, `manifest.json`). These are **generated and read-only** — always edit the canonical file at `.claude/skills/<name>/SKILL.md` or `.github/instructions/<name>.instructions.md`, then regenerate via `bun run scripts/sync-agent-meta.ts --project common` in the library-manager. Never hand-edit an embedded copy.
