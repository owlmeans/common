# OwlMeans Common — Project Context

## Git Workflow (mandatory)

Before any git operation follow the rules in `.agents/rules/git.md` — they override default agent
behavior (including any AI `Co-Authored-By` trailer).

@.agents/rules/git.md

## Environments (mandatory)

This monorepo exists as several parallel checkouts: the primary one at
`~/projects/owlmeans/common` and one per development slot under
`~/projects/owlmeans/vslots/<slot>/common`, each paired with the slot's own deployed
environment (its own release names, master secret, hosts, database and cache prefix).

Work only on the environment your checkout path identifies. Build, test, deploy and inspect that
one alone; never touch another slot's files, releases or data, and never pass `--all` to a
slot-aware script, unless the operator asks for it explicitly in the current request. Other
environments share the machine and the cluster, so their activity can show up as port contention,
busy browsers or unrelated rollouts — that is expected background noise, not something to fix.

## Reporting (mandatory)

Always report concisely and briefly, in table format, about WHAT was done rather than why —
unless the operator explicitly asks for another format, length, or level of detail.

- Changes: one row per file/item — **Change** (created / modified / deleted), **Path**,
  **Why** (one short phrase). One table per affected project (each is a separate repo).
- Findings / status / verification: a short table plus at most a few lines of prose.
- No preamble, no narration of the process; expand on WHY only when asked.
- At most **one phrase per issue** — until the operator asks otherwise.
- Findings and advice **not acted on** go in their own explicit separate section, kept as short
  as possible — never mixed with what was done.
- Explaining an issue = a table with **Where | Cause | Effects | Code details**. Code details and
  explanation are never one sentence — always two separate sentences.
- Modes aimed **"to impress"** (from LLM training or agent defaults): forget and avoid them — at
  minimum keep them out of reports — until the operator explicitly asks.

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

## Self-Education (mandatory)

Whenever development started from a plan agreed with the agent, the work is not complete until
the `self-education` skill has been applied: rewrite the project skills the change touched so they
state current rules (never a note about what changed), record external-doc findings (URL + gist)
in the governing skill, or add a skill for a new subsystem or technology. The completion report
must include the self-education outcome — or state why none was needed.

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
- **Infrastructure**: `kluster` (Kubernetes), `mongo`, `mongo-resource`, `postgres`, `postgres-resource`, `redis`, `redis-resource`, `storage-common`, `storage-resource`, `image-resource`, `static-resource`
- **AI/LLM**: `llm-common` (serializable inference + execution contracts), `llm` (model, provider plugins, model factory, execution service)
- **Other**: `oidc`, `payment`, `queue`, `flow`, `wled`

## Key Facts

- ~73 packages, all `@owlmeans/*` namespace; `_tpl` is a template excluded from build
- TypeScript 6.0+, ESM + CJS dual exports, build output → `build/`, version 0.1.2
- TypeScript configs live in `packages/dep-config/`: `tsconfig.base.json` (strict, ESNext, Bundler resolution), `tsconfig.react.json` (JSX+DOM), `tsconfig.server.json` (no DOM), `tsconfig.node.json` (server + Node globals), `tsconfig.bun.json` (server + Bun globals)
- Each package extends `@owlmeans/dep-config/tsconfig.base.json`; React packages also extend `tsconfig.react.json`; server packages extend `tsconfig.server.json`, `tsconfig.node.json`, or `tsconfig.bun.json` as appropriate
- React is a peer dependency; UI routing is the OwlMeans plugin host (`@owlmeans/router` + default `@owlmeans/web-router`), react-router only through the opt-in `@owlmeans/web-router-react-router` plugin
- Cryptography: `@noble/curves`, `@noble/hashes`, `@scure/base`, `@scure/bip39`
- Validation: AJV with ajv-formats
- **UI strategy**: MUI-based `web-panel` is the current Web UI layer; new shadcn UI + Tailwind CSS v4 packages are being developed alongside to replace it — see `shadcn-web` and `shadcn-versions` skills

## Build & Scripts

```bash
bun install                    # install all workspace dependencies
bun run build                  # build all packages (tsc -b per package)
bun run watch                  # watch mode for all packages
bun run dev                    # dev mode with nodemon
bun run test                   # run all package test scripts (bun test for A/B/C, playwright for D)
```

## Testing strategy (read before suggesting test code)

Every package falls in exactly one category:

| Cat | Strategy | Mocking | Runner |
|-----|----------|---------|--------|
| A | Unit, real sibling-package imports | None | `bun test` |
| B | Unit with auth/authz mocks | Only via `@owlmeans/test-auth` | `bun test` |
| C | Env-gated integration | None | `bun test` |
| D | Component-level acceptance, real chromium | None | `bun test` (drives Playwright as a library) |

Eight invariants:

1. Tests live in `packages/<pkg>/tests/`, named `*.spec.ts`.
2. Each package with tests has a single `tests/context.ts` that builds a real context once and exports a helper that specs import.
3. Cross-package imports are real. Sibling packages are never mocked.
4. Auth/authz is the only mockable boundary, only in category B, only via `@owlmeans/test-auth`. New auth mocks belong in that package — never in a per-package `tests/`.
5. Don't test context plumbing. Don't test utils. Don't test types.
6. Cover the package's skill (`.agents/skills/<pkg>/SKILL.md`) and `README.md` cases first — those are the consumer-facing surface.
7. Max 3-4 tests per method/function.
8. Category C: env-gated provisioning. If a required env var (see `.env.example`) is empty, the corresponding service is not registered in the test context AND specs that need it self-skip with a printed reason — never fail.

Shared test packages (under `packages/`):

- `@owlmeans/test` — `loadEnv`, `requireEnv`, `hasEnv`, `makeGates`, `loadFixture`.
- `@owlmeans/test-auth` — `makeFixtureKeyPair`, `makeMemoryTrustedResource`, `makeMockGuard`, `withAuth`, `signMockEnvelope`, `makeBearer`, fixtures (`SUPERUSER`, `USER`, `SERVICE`).
- `@owlmeans/test-integration` — `mongoGate`, `redisGate`, `s3Gate`, `kubeGate`, `randomNamespace`, `registerCleanup`, `runCleanups`.
- `@owlmeans/test-ui` — `launchBrowser`, `closeBrowser`, `withPage`, `mountComponent`, plus a starter `harness/index.html`. Built on the `playwright` library (not the `@playwright/test` runner).

Per-category skills: `testing-overview`, `testing-unit`, `testing-auth-unit`, `testing-integration`, `testing-ui`, `auth-protocol`.

## Skills

Reusable guidance lives in `.agents/skills/<name>/SKILL.md` — the single canonical store, read
natively by Copilot and Codex, and by Claude Code through the generated symlinks in
`.claude/skills/` (see `CLAUDE.md`). Agents load a skill by topic; you can also run `/<name>`.

- **Reuse before you build (mandatory)**: `reuse-code` — before planning or writing any feature, find an existing `@owlmeans/*` package (research locally since this IS the common repo) or existing code that already solves the problem **before** proposing a third-party library or custom solution; extend before writing new; simplify what you write.
- **Localization (i18n)**: `localization` — tiered namespace model, compound-prefix keys, 7-language requirement (`SUPPORTED_LNGS`), override pattern, language switcher. Read **before** adding any UI string or translation file. Package-specific: `i18n` (core registry) and `client-i18n` (React hooks).
- **Dependency tree (canonical map)**: [`tree.md`](tree.md) at the repo root — every package, its direct `@owlmeans/*` deps, its architecture layer, build order, and known SCCs. The `dependency-tree` skill points to it.
- **Bun (package manager & build)**: `bun` — install, build, script, and workspace-filter work
- **Scaffolding a new app / getting started**: guide at [`docs/getting-started.md`](docs/getting-started.md) (linked from root README) shows how to build a minimal fullstack app (`common`/`api`/`web`, shadcn UI, no auth, session-scoped in-memory `static-resource`) two ways — via `@owlmeans/create-app` (`packages/create-app`, the `npm create @owlmeans/app` scaffolder that also deploys agent-skills) or manually. General skills `getting-started` and `scaffolding` carry this knowledge and route to `@owlmeans/agent-skills` as installer extras.
- **Authoring skills**: `skill-authoring` (add guidance to any OwlMeans project) and `create-skill` (this monorepo's own conventions)
- **Versioning**: `versions` — how to bump package versions across the monorepo
- **TypeScript configs**: `tsconfig` — how to configure tsconfig in packages, which configs to extend
- **shadcn UI + Tailwind v4 web packages**: `shadcn-web` (development & maintenance, the `@` alias contract, Tailwind wiring, MUI→shadcn mapping) + `shadcn-versions` (version management). `testing-ui` covers Playwright tests for shadcn packages.
- **Auth protocol and local identity**: `auth-protocol` and `server-auth-identity`
- **Email OTP authentication**: `server-auth-otp`; mailer transports: `mailer` and `server-mailer-mailgun`
- **OIDC/OAuth dependency versions**: `oidc-versions` — exact-pin policy, upgrade checklists for oidc-provider, jose, openid-client, oidc-client-ts, isolation principle, downstream verification
- **Using @owlmeans/* packages from a downstream app**: every package has its own skill at `.agents/skills/<package-name>/SKILL.md` (e.g. `server-app`, `entrypoint`, `route`, `context`, `config`, `web-client`, `web-panel`, `client-auth`, `mongo`, `postgres`, `redis`, `kluster`, etc.) — loaded when working with that package's imports. Patterns mirror real-world consumption from the `viable` monorepo (`/home/igor/projects/owlmeans/viable`).

## Maintenance

Guidance is single-source: `AGENTS.md` plus the skills in `.agents/skills/`. When a change
invalidates a rule, rewrite it in place in the same change-set (`self-education`).

- New guidance is one skill — never a `.github/instructions/*.instructions.md`, a
  `.github/copilot-instructions.md`, or a file authored under `.claude/skills/`.
- `.claude/skills/` holds generated per-skill symlinks only. After creating, renaming, or deleting
  a skill, run `sh .agents/scripts/link-skills.sh`.
- **Agent-meta (embedded guidance)**: every published `@owlmeans/*` package ships a generated,
  read-only copy of its skill in `packages/<pkg>/agent-meta/` (layout: `manifest.json`,
  `skills/<name>/SKILL.md`). Edit the canonical `.agents/skills/<name>/SKILL.md`, then regenerate
  with `bun run scripts/sync-agent-meta.ts --project common` in the library-manager. Never
  hand-edit an embedded copy.
