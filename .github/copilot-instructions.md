# OwlMeans Common — GitHub Copilot Project Context

## Memory & Meta-file Rules

All project memory and meta-information must be stored inside this project, never in `~/.copilot/`:

- **Always** write new memory files to `.github/memory/` in this project root
- **Always** update `.github/memory/MEMORY.md` index when adding a new memory file
- **Never** write project-related memory outside the project repository
- For context that should load every session: add it to `.github/copilot-instructions.md`
- For context loaded on demand: put it in `.github/instructions/<topic>.instructions.md`
- When asked to remember something about this project, save it to `.github/memory/<topic>.md` and update `.github/memory/MEMORY.md`

### When to read memory

- **At the start of every conversation**: read `.github/memory/MEMORY.md` to see what memory files exist, then read any that are relevant to the current task
- **Before starting any non-trivial task**: check if a relevant `.github/memory/*.md` or `.github/instructions/*.instructions.md` file exists and read it
- **When a topic comes up** (e.g. bun, auth, deployment): read the corresponding file before acting
- **After completing a task** that produced new knowledge: save it to the appropriate memory file

## What This Is

Security-first TypeScript monorepo framework for fullstack applications with microservices/microclients architecture. Provides unified abstractions for web, mobile (React Native — see `native` monorepo), and server-side code with cryptographic auth (Ed25519/DID) baked in.

## Architecture Layers ("Quadra" pattern)

When working on a package, identify its layer: **Core → Server/Client → Web**

- **Configuration**: `dep-config` — shared TypeScript configs for all packages
- **Core**: `context`, `error`, `auth`, `config`, `i18n`, `state`, `entrypoint`, `route`, `router`, `resource`, `socket`, `did`, `basic-*`
- **Server**: `server-api`, `server-app`, `server-auth`, `server-auth-identity`, `server-config`, `server-context`, `server-entrypoint`, `server-route`, `server-socket`, `server-oidc-*`, `server-wl`
- **Client** (platform-agnostic): `client`, `client-auth`, `client-config`, `client-context`, `client-did`, `client-flow`, `client-i18n`, `client-entrypoint`, `client-panel`, `client-payment`, `client-resource`, `client-route`, `client-socket`, `client-wl`
- **Web** (React): `web-client`, `web-router`, `web-panel`, `web-db`, `web-flow`, `web-oidc-*`, `web-wl` — current MUI-based packages; a new shadcn UI + Tailwind v4 family is being introduced alongside (wraps `client-panel`, uses the `@` app-provides contract — see `shadcn-web.instructions.md`)
- **Native** (React Native): moved to the `native` monorepo — `native-client`, `native-router`, `native-panel`, `native-db`
- **Infrastructure**: `kluster` (Kubernetes), `mongo`, `mongo-resource`, `redis`, `redis-resource`, `storage-common`, `storage-resource`, `image-resource`, `static-resource`
- **Other**: `oidc`, `payment`, `queue`, `flow`, `wled`

## Key Facts

- ~71 packages, all `@owlmeans/*` namespace; `_tpl` is a template excluded from build
- TypeScript 6.0+, ESM + CJS dual exports, build output → `build/`, version 0.1.2
- TypeScript configs live in `packages/dep-config/`: `tsconfig.base.json` (strict, ESNext, Bundler resolution), `tsconfig.react.json` (JSX+DOM), `tsconfig.server.json` (no DOM), `tsconfig.node.json` (server + Node globals), `tsconfig.bun.json` (server + Bun globals)
- Each package extends `@owlmeans/dep-config/tsconfig.base.json`; React packages also extend `tsconfig.react.json`
- React is a peer dependency, pinned to react-router v7 via `overrides`
- Cryptography: `@noble/curves`, `@noble/hashes`, `@scure/base`, `@scure/bip39`
- Validation: AJV with ajv-formats
- **UI strategy**: MUI-based `web-panel` is the current Web UI layer; new shadcn UI + Tailwind CSS v4 packages are being developed alongside to replace it — see `shadcn-web.instructions.md` and `shadcn-versions.instructions.md`
- **Package manager: Bun 1.3.10** — always use `bun`, never `yarn` or `npm`

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
6. Cover the package's `.github/instructions/<pkg>.instructions.md` and `README.md` cases first — those are the consumer-facing surface.
7. Max 3-4 tests per method/function.
8. Category C: env-gated provisioning. If a required env var (see `.env.example`) is empty, the corresponding service is not registered in the test context AND specs that need it self-skip with a printed reason — never fail.

Shared test packages (under `packages/`):

- `@owlmeans/test` — `loadEnv`, `requireEnv`, `hasEnv`, `makeGates`, `loadFixture`.
- `@owlmeans/test-auth` — `makeFixtureKeyPair`, `makeMemoryTrustedResource`, `makeMockGuard`, `withAuth`, `signMockEnvelope`, `makeBearer`, fixtures (`SUPERUSER`, `USER`, `SERVICE`).
- `@owlmeans/test-integration` — `mongoGate`, `redisGate`, `s3Gate`, `kubeGate`, `randomNamespace`, `registerCleanup`, `runCleanups`.
- `@owlmeans/test-ui` — `launchBrowser`, `closeBrowser`, `withPage`, `mountComponent`, plus a starter `harness/index.html`. Built on the `playwright` library (not the `@playwright/test` runner).

Per-category instruction files:

- `.github/instructions/testing-unit.instructions.md`
- `.github/instructions/testing-auth-unit.instructions.md`
- `.github/instructions/testing-integration.instructions.md`
- `.github/instructions/testing-ui.instructions.md`
- `.github/instructions/auth-protocol.instructions.md`

## Additional Context

- **Dependency tree (canonical map)**: [`tree.md`](../tree.md) at the repo root — every package, its direct `@owlmeans/*` deps, its architecture layer, build order, and known SCCs. Instruction at `.github/instructions/dependency-tree.instructions.md` points to it.
- **Bun**: see `.github/instructions/bun.instructions.md` — install, build, scripts, workspace filters
- **Versioning**: see `.github/instructions/versions.instructions.md` — synchronized version bumps
- **TypeScript configs**: see `.github/instructions/tsconfig.instructions.md` — which config to extend
- **Creating instructions**: see `.github/instructions/create-skill.instructions.md`
- **shadcn UI + Tailwind v4 web packages**: see `.github/instructions/shadcn-web.instructions.md` (development & maintenance, the `@` alias contract, Tailwind wiring, MUI→shadcn mapping) and `.github/instructions/shadcn-versions.instructions.md` (version management). `.github/instructions/testing-ui.instructions.md` covers Playwright tests for shadcn packages too.
- **Auth protocol and local identity**: see `.github/instructions/auth-protocol.instructions.md` and `.github/instructions/server-auth-identity.instructions.md`
- **Using @owlmeans/* packages from a downstream app**: every package has its own instruction file at `.github/instructions/<package-name>.instructions.md` (e.g. `server-app`, `entrypoint`, `route`, `context`, `config`, `web-client`, `web-panel`, `client-auth`, `mongo`, `redis`, `kluster`, etc.) — `applyTo` globs auto-attach when editing matching files. Patterns mirror real-world consumption from the `viable` monorepo.
