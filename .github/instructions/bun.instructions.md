---
description: "Bun package manager and build commands for this OwlMeans monorepo. Use when installing packages, building, watching, or running scripts. Covers workspace filters, tsc -b builds, and monorepo-specific patterns."
applyTo: "**/package.json, **/bunfig.toml, **/bun.lock"
---

# Bun — OwlMeans Common Monorepo

Migrated from Yarn v4 to **Bun 1.3.10** (April 2026). Always use `bun`, never `yarn` or `npm`.

## Package Management

- Install all workspace deps: `bun install`
- Add dep to specific workspace: `bun add <pkg> --cwd packages/<name>`
- Add dep to root: `bun add <pkg>`
- Lock file: `bun.lock` (tracked in git)
- Workspace config: `workspaces: ["packages/*"]` in root `package.json`
- Overrides (not `resolutions`) for dependency pinning (e.g. react-router v7)

## Building

- Build all packages: `bun run build` from root
- Build one package: `bun run build` from inside `packages/<name>`, or `bun --filter '@owlmeans/<name>' run build` from root
- Each package compiles with: `tsc -b` (no bundler, pure TypeScript)
- Output: `packages/<name>/build/`
- Watch mode: `bun run watch` → `tsc -b -w` per package
- Dev mode: `bun run dev` → nodemon watching `src/`

## Root Scripts

```json
"dev":   "bun run --filter '@owlmeans/*' --filter '!@owlmeans/_tpl' dev",
"build": "bun run --filter '@owlmeans/*' --filter '!@owlmeans/_tpl' build",
"watch": "bun run --filter '@owlmeans/*' --filter '!@owlmeans/_tpl' watch"
```

## Rules & Gotchas

- Syntax: `bun run --filter <pattern> <script>` — NOT `bun --filter ... run <script>`
- Negation filter alone (`'!@owlmeans/_tpl'`) matches nothing — always pair with a positive filter
- `_tpl` package is named `@owlmeans/_tpl` in its `package.json` — always exclude it from builds
- No `.yarnrc.yml` — removed during migration
- Peer dep warning about `@mui/material` is expected and non-blocking
- Hoisted linker required: `bunfig.toml` must have `[install] linker = "hoisted"`
