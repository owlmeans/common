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
- **Core**: `context`, `error`, `auth`, `config`, `i18n`, `state`, `module`, `route`, `router`, `resource`, `socket`, `did`, `basic-*`
- **Server**: `server-api`, `server-app`, `server-auth`, `server-config`, `server-context`, `server-module`, `server-route`, `server-socket`, `server-oidc-*`, `server-wl`
- **Client** (platform-agnostic): `client`, `client-auth`, `client-config`, `client-context`, `client-did`, `client-flow`, `client-i18n`, `client-module`, `client-panel`, `client-payment`, `client-resource`, `client-route`, `client-socket`, `client-wl`
- **Web** (React): `web-client`, `web-router`, `web-panel`, `web-db`, `web-flow`, `web-oidc-*`, `web-wl`
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
- **Package manager: Bun 1.3.10** — always use `bun`, never `yarn` or `npm`

## Build & Scripts

```bash
bun install                    # install all workspace dependencies
bun run build                  # build all packages (tsc -b per package)
bun run watch                  # watch mode for all packages
bun run dev                    # dev mode with nodemon
```

## Additional Context

- **Bun**: see `.github/instructions/bun.instructions.md` — install, build, scripts, workspace filters
- **Versioning**: see `.github/instructions/versions.instructions.md` — synchronized version bumps
- **TypeScript configs**: see `.github/instructions/tsconfig.instructions.md` — which config to extend
- **Creating instructions**: see `.github/instructions/create-skill.instructions.md`
