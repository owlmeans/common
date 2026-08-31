---
name: bun
description: Bun package manager and build commands for this OwlMeans monorepo. Use when installing packages, building, watching, or running scripts. Covers workspace filters, tsc -b builds, and monorepo-specific patterns.
allowed-tools: Bash(bun *)
---

# Bun — OwlMeans Monorepo

Migrated from Yarn v4 to **Bun** (April 2026). Always use `bun`, never `yarn` or `npm`. The repo
pins `packageManager: bun@1.4.0`; every linked consumer repo pins the same version.

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
- `bun install` should finish with **no** peer-dependency warnings — treat one as a range to fix,
  not noise (see the shadowing section below)
- `bun run --filter` does **not** order builds topologically here — the workspace graph has SCCs
  (see `tree.md`), so every package's `tsc -b` starts in parallel. Incremental builds are fine
  because `build/` already exists; a build from clean needs the command repeated until it exits 0
  (typically 2–3 passes). Never read a single failing pass from clean as a source error.
- A clean rebuild must delete **two** kinds of artifact. `build/` holds a tracked `.gitkeep` per
  package (keep it), and each package's incremental state lives at
  `packages/<pkg>/tsconfig.tsbuildinfo` — **outside** `build/`. Leaving the `tsbuildinfo` behind
  makes `tsc -b` skip work, so the build is not really from scratch:

  ```bash
  for d in packages/*/build; do find "$d" -mindepth 1 -not -name .gitkeep -delete; done
  find packages -name 'tsconfig.tsbuildinfo' -not -path '*/node_modules/*' -delete
  ```

  A genuine from-clean run converges in about three passes (order of ~2700 → single digits → 0).
- `bun.lock` is **gitignored**, so it never appears in a merge conflict and any `bun install`
  silently re-resolves every floating range. After one, re-check the versions that matter rather
  than assuming the tree is unchanged.
- Expect `packages/client-module` and `packages/server-module` to hold nothing but empty `build/`
  and `node_modules/` — untracked leftovers, not packages. `dep-config` is config-only and has no
  `build` script. Everything else builds.
- Several packages declare a `test` script but ship no `tests/` directory, so `bun run test` reports
  `Test filter "./tests" had no matches` and exits 1 for each: `auth-otp`, `client-iam`, `mailer`,
  `server-auth-identity`, `server-auth-otp`, `server-mailer-mailgun`, `web-auth`. Expected, not a
  regression — read the per-package pass/fail counts, not the aggregate exit code.
- **`bson` floats — there is no override, and Bun 1.4.0 is why.** From `bson@7.3.0` on, a static
  initializer calls `process.getBuiltinModule('v8').startupSnapshot.isBuildingSnapshot()`. No Bun
  **through 1.3.14** implements it, so on those `import 'mongodb'` throws
  `NotImplementedError: node:v8 isBuildingSnapshot is not yet implemented in Bun` before any
  OwlMeans code runs — a server-runtime break, not just a test one: the `mongo`/`mongo-resource`
  suites die at import, before their env gate can skip them. **Bun 1.4.0 implements the call**, so
  with `packageManager: bun@1.4.0` the driver's own `bson: ^7.2.0` range is safe to resolve freely
  and every repo here runs `bson@7.3.x`.

  This makes the Bun floor load-bearing: **dropping any runtime below 1.4.0 reintroduces the crash**
  — a rolled-back `oven/bun` image, or a checkout whose `packageManager` was not raised. Check the
  runtime, not the lockfile, before lowering one:

  ```bash
  bun -e "import('./node_modules/mongodb/lib/index.js').then(()=>console.log('OK')).catch(e=>console.log(e.code))"
  ```

  If a repo ever has to run an older Bun again, the fix is `"bson": "7.2.0"` in **that repo's own**
  root `overrides` — `overrides` do not cross a repo boundary, so a linked consumer (`internal`,
  `viable-agent`, `viable`) resolves its own tree and common's entry does nothing for it. Such a
  failure surfaces only at runtime, in the pod; the build and every unit suite still pass. Check per
  repo with `node -p "require('./node_modules/bson/package.json').version"`.

## Troubleshooting: nested `node_modules` copies that shadow the root

**The single most common cause of inexplicable build and test failures in this repo.** Bun puts a
real directory in `packages/<pkg>/node_modules/<dep>` whenever that package's declared range cannot
be served by the hoisted root copy. It wins over the root for anything resolved from inside that
package, and a later `bun install` will not prune it. Three faces of the same bug, all observed:

| Symptom | Shadowed dep | Real cause |
|---|---|---|
| `TS2305 Module '@owlmeans/x' has no exported member 'Y'` — but `packages/x/build/*.d.ts` is fresh and correct | `@owlmeans/*` | published tarball of an older version, from a mid-version-bump install |
| `TS2769 No overload matches this call` on MUI `Stack`/`Box` props in one package only | `@mui/material` | a `devDependencies` range that outran the `peerDependencies` range — the package typechecks against a major it does not declare support for |
| Browser specs all fail with `Target page, context or browser has been closed`, browser log shows `Incompatible React versions` | `react-dom` | stale nested copy left one patch behind the root, and React demands exact-equal `react`/`react-dom` |
| One nested copy per linked package — `libraries/common/packages/*/node_modules/typescript` ×90 | `typescript` | a **build-time** dep whose range differs across the repo boundary (common `^7.0.2`, consumer `^5.9.2`). Nothing fails loudly: each package compiles with its own `tsc`, so the split only shows up as consumers typechecking upstream `.d.ts` with an older compiler |
| `TS2322 … Two different types with this name exist, but they are unrelated` on plain `<div>` props or `CSSProperties` | `@types/react` | the two repos resolved different patches of the same `^` range (19.2.17 vs 19.2.18). Type identity is per-declaration-file, so one patch apart is enough. `bun update @types/react @types/react-dom` in **every** repo, then confirm they match |

Diagnose — list every duplicate, not just the one you suspect:

```bash
find packages/*/node_modules -maxdepth 2 -name package.json \
  | while read f; do echo "$(bun -e "console.log(require('$f').name, require('$f').version)") <- $f"; done
grep -c 'owlmeans/[a-z-]*@0\.' bun.lock   # should be 0 (workspace only)
```

Fix — delete the nested copy and reinstall; then fix the range that invited it, or it comes back:

```bash
rm -rf packages/*/node_modules/<dep>
bun install
```

**Keep `devDependencies` inside the `peerDependencies` range.** A package declaring
`peerDependencies: { "@mui/material": "^7.*" }` must dev-depend on `^7.*` too. Dependabot's
dev-dependency group bumps do not respect peer ranges, so check that pairing whenever one lands.
