---
name: bun
description: Bun package manager and build commands for this OwlMeans monorepo. Use when installing packages, building, watching, or running scripts. Covers workspace filters, tsc -b builds, and monorepo-specific patterns.
allowed-tools: Bash(bun *)
---

# Bun — OwlMeans Monorepo

Migrated from Yarn v4 to **Bun 1.3.10** (April 2026). Always use `bun`, never `yarn` or `npm`.

## Package Management

- Install all workspace deps: `bun install`
- Add dep to specific workspace: `bun add <pkg> --cwd packages/<name>`
- Add dep to root: `bun add <pkg>`
- Lock file: `bun.lock` (untracked — listed in `.gitignore`)
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
- `bun run --filter` does **not** order builds topologically here — the workspace graph has SCCs
  (see `tree.md`), so every package's `tsc -b` starts in parallel. Incremental builds are fine
  because `build/` already exists; a build from clean needs the command repeated until it exits 0
  (typically 2–3 passes). Never read a single failing pass from clean as a source error.
- `build/` holds a tracked `.gitkeep` per package — when clearing build output, delete the
  contents and keep that file:
  `for d in packages/*/build; do find "$d" -mindepth 1 -not -name .gitkeep -delete; done`

## Troubleshooting: bogus "has no exported member" errors across many packages

Symptom: `tsc -b` reports `TS2305 Module '@owlmeans/x' has no exported member 'Y'` for symbols
that plainly exist in `packages/x/src`, and `packages/x/build/*.d.ts` is fresh and correct.

Cause: real (non-symlink) directories under `packages/<pkg>/node_modules/@owlmeans/*` holding
**published tarballs of an older version**. They shadow the workspace symlinks in root
`node_modules/@owlmeans/`, so consumers typecheck against the old published API. Bun creates them
when a dependency range cannot be satisfied by the workspace — e.g. mid-version-bump, when deps
already say `^<new>` but the workspace `package.json` files still say `<old>` — and a later
`bun install` links the workspace at root without ever pruning them.

Diagnose:

```bash
find packages/*/node_modules/@owlmeans -maxdepth 1 -mindepth 1 -type d   # should be empty
grep -c 'owlmeans/[a-z-]*@0\.' bun.lock                                  # should be 0 (workspace only)
tsc --traceResolution --noEmit | grep 'was successfully resolved'        # confirm the winning path
```

Fix — the nested copies are extraneous (`bun install` will not recreate them):

```bash
rm -rf packages/*/node_modules/@owlmeans
bun install
bun run build   # repeat until exit 0
```
