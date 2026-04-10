# OwlMeans Common — Project Context

## Memory & Meta-file Rules

All project memory and meta-information must be stored inside this project, never in `~/.claude/`:

- **Always** write new memory files to `.claude/memory/` in this project root
- **Always** update `.claude/memory/MEMORY.md` index when adding a new memory file
- **Never** write project-related memory to `~/.claude/projects/*/memory/`
- For context that should load every session: add it to `CLAUDE.md` or import it with `@.claude/filename.md`
- For context loaded on demand: put it in `.claude/<topic>.md` and reference it from the "Additional Context" section below
- When asked to remember something about this project, save it to `.claude/memory/<topic>.md` and update `.claude/memory/MEMORY.md`

### When to read memory

- **At the start of every conversation**: read `.claude/memory/MEMORY.md` to see what memory files exist, then read any that are relevant to the current task
- **Before starting any non-trivial task**: check if a relevant `.claude/memory/*.md` or `.claude/<topic>.md` file exists and read it
- **When a topic comes up** (e.g. bun, auth, deployment): read the corresponding file before acting, don't rely on assumptions
- **After completing a task** that produced new knowledge (decisions made, patterns established, gotchas found): save it to the appropriate memory file

## What This Is

Security-first TypeScript monorepo framework for fullstack applications with microservices/microclients architecture. Provides unified abstractions for web, mobile (React Native), and server-side code with cryptographic auth (Ed25519/DID) baked in.

## Architecture Layers ("Quadra" pattern)

When working on a package, identify its layer: **Core → Server/Client → Web/Native**

- **Core**: `context`, `error`, `auth`, `config`, `i18n`, `state`, `module`, `route`, `router`, `resource`, `socket`, `did`, `basic-*`
- **Server**: `server-api`, `server-app`, `server-auth`, `server-config`, `server-context`, `server-module`, `server-route`, `server-socket`, `server-oidc-*`, `server-wl`
- **Client** (platform-agnostic): `client`, `client-auth`, `client-config`, `client-context`, `client-did`, `client-flow`, `client-i18n`, `client-module`, `client-panel`, `client-payment`, `client-resource`, `client-route`, `client-socket`, `client-wl`
- **Web** (React): `web-client`, `web-router`, `web-panel`, `web-db`, `web-flow`, `web-oidc-*`, `web-wl`
- **Native** (React Native): `native-client`, `native-router`, `native-panel`, `native-db`
- **Infrastructure**: `kluster` (Kubernetes), `mongo`, `mongo-resource`, `redis`, `redis-resource`, `storage-common`, `storage-resource`, `image-resource`, `static-resource`
- **Other**: `oidc`, `payment`, `queue`, `flow`, `wled`

## Key Facts

- ~75 packages, all `@owlmeans/*` namespace; `_tpl` is a template excluded from build
- TypeScript, ESM + CJS dual exports, build output → `build/`, version 0.1.2
- TypeScript base config: `packages/tsconfig.default.json` (strict, ESNext, isolated modules)
- React is a peer dependency, pinned to react-router v7
- Cryptography: `@noble/curves`, `@noble/hashes`, `@scure/base`, `@scure/bip39`
- Validation: AJV with ajv-formats

## Additional Context

- **Bun (package manager & build)**: skill at `.claude/skills/bun/SKILL.md` — auto-invoked when doing install, build, or script work
- **Creating skills**: skill at `.claude/skills/create-skill/SKILL.md` — follow this when converting knowledge into a new skill
