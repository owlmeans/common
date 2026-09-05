---
name: bun
description: Bun package manager and build commands for this OwlMeans monorepo — workspace filters, tsc -b builds, from-clean rebuilds, and the nested node_modules copies that shadow the root. Use when installing packages, building, watching, running scripts, or diagnosing a build/test failure that makes no sense against the source.
allowed-tools: Bash(bun *)
---

# Bun — OwlMeans Monorepo

This monorepo is managed with **Bun** — always `bun`, never `yarn` or `npm`. The root pins
`packageManager: bun@1.4.0`; every linked consumer repo pins the same version. `bunfig.toml` sets
`linker = "hoisted"` and a 15s default `bun test` timeout. A package whose specs need longer
raises it in its own `bunfig.toml`, and `redis-queue` is the only one that does (60s, because its
specs drive a real broker end to end); its file repeats `linker = "hoisted"` next to the timeout.
The one other `bunfig.toml` under `packages/` is the scaffold seed in `create-app/template`, which
sets the linker and no timeout.

## Package Management

- Install all workspace deps: `bun install`
- Add dep to specific workspace: `bun add <pkg> --cwd packages/<name>`
- Add dep to root: `bun add <pkg>`
- Lock file: `bun.lock` (untracked — listed in `.gitignore`)
- Workspace config: `workspaces: ["packages/*"]` in root `package.json`
- Pin a transitive dependency through root `overrides` (Bun's field — not yarn's `resolutions`);
  the standing entry is `"react-router": "^8.*"`

## Building

- Build all packages: `bun run build` from root
- Build one package: `bun run build` from inside `packages/<name>`, or
  `bun run --filter '@owlmeans/<name>' build` from root
- Each package compiles with: `tsc -b` (no bundler, pure TypeScript)
- Output: `packages/<name>/build/`
- Watch mode: `bun run watch` → `tsc -b -w --preserveWatchOutput --pretty` per package
- Dev mode: `bun run dev` → nodemon re-running `tsc -p ./tsconfig.json` on `src` changes. Each
  package's `dev` script opens with a `sleep <n>` whose value staggers it against the others, so a
  parallel dev run does not start ~100 compilers in the same second. Keep the stagger when editing
  one.

## Root Scripts

```json
"dev":   "bun run --filter '@owlmeans/*' --filter '!@owlmeans/_tpl' --parallel dev",
"build": "bun run --filter '@owlmeans/*' --filter '!@owlmeans/_tpl' build",
"watch": "bun run --filter '@owlmeans/*' --filter '!@owlmeans/_tpl' --parallel watch",
"test":  "bun run --filter '@owlmeans/*' --filter '!@owlmeans/_tpl' --filter '!@owlmeans/dep-config' test"
```

## Rules & Gotchas

- Syntax: `bun run --filter <pattern> <script>` — NOT `bun --filter ... run <script>`
- Negation filter alone (`'!@owlmeans/_tpl'`) matches nothing — always pair with a positive filter
- `_tpl` package is named `@owlmeans/_tpl` in its `package.json` — always exclude it from builds
- There is no `.yarnrc.yml` and no yarn/npm lockfile here; do not add one
- `bun install` should finish with **no** peer-dependency warnings — treat one as a range to fix,
  not noise (see the shadowing section below)
- `bun run --filter` does **not** order builds topologically here — the workspace graph has SCCs
  (see `tree.md`), so every package's `tsc -b` starts in parallel. Incremental builds are fine
  because `build/` already exists; a build from clean needs the command repeated until it exits 0
  (typically 2–3 passes). Never read a single failing pass from clean as a source error.
- A clean rebuild must delete **two** kinds of artifact. `build/` output, and each package's
  incremental state at `packages/<pkg>/tsconfig.tsbuildinfo` — **outside** `build/`. Leaving the
  `tsbuildinfo` behind makes `tsc -b` skip work, so the build is not really from scratch. A `build/`
  directory may hold a tracked `.gitkeep`; keep it:

  ```bash
  for d in packages/*/build; do find "$d" -mindepth 1 -not -name .gitkeep -delete; done
  find packages -name 'tsconfig.tsbuildinfo' -not -path '*/node_modules/*' -delete
  ```

  A genuine from-clean run converges in about three passes (order of ~2700 → single digits → 0).
- `bun.lock` is **gitignored**, so it never appears in a merge conflict and any `bun install`
  silently re-resolves every floating range. After one, re-check the versions that matter rather
  than assuming the tree is unchanged.
- `dep-config` is config-only and declares no `build` script; every other package under `packages/`
  builds. A directory there holding only `build/` and `node_modules/` with no `package.json` is an
  untracked leftover from a removed package, not a workspace member — delete it rather than
  debugging why it will not compile.
- Several packages declare a `test` script but ship no `tests/` directory, so `bun run test` reports
  `Test filter "./tests" had no matches` and exits 1 for each: `auth-otp`, `client-iam`, `mailer`,
  `server-auth-otp`, `server-mailer-mailgun`, `web-auth`. Expected, not a regression — read the
  per-package pass/fail counts, not the aggregate exit code.
- **The pinned Bun floor is load-bearing for MongoDB.** `bson@7.3.x` runs a static initializer that
  calls `process.getBuiltinModule('v8').startupSnapshot.isBuildingSnapshot()`, and Bun implements
  that call from **1.4.0** on. Every repo here pins `packageManager: bun@1.4.0`, so the driver's own
  `bson: ^7.2.0` range resolves freely and **no repo carries a `bson` override** — do not add one.
  Every runtime that loads `mongodb` must be at 1.4.0 or above: the local shell, CI, and the
  `oven/bun` image in the pod. Below it `import 'mongodb'` throws `NotImplementedError: node:v8
  isBuildingSnapshot is not yet implemented in Bun` before any OwlMeans code runs, so the
  `mongo`/`mongo-resource` suites die at import before their env gate can skip them, while the build
  and every other unit suite still pass — the break surfaces only at runtime. Check the runtime, not
  the lockfile, before lowering one:

  ```bash
  bun -e "import('./node_modules/mongodb/lib/index.js').then(()=>console.log('OK')).catch(e=>console.log(e.code))"
  ```

## Troubleshooting: nested `node_modules` copies that shadow the root

**The single most common cause of inexplicable build and test failures in this repo.** Bun puts a
real directory in `packages/<pkg>/node_modules/<dep>` whenever that package's declared range cannot
be served by the hoisted root copy. It wins over the root for anything resolved from inside that
package, and a later `bun install` will not prune it. Five faces of the same bug, all observed:

| Symptom | Shadowed dep | Real cause |
|---|---|---|
| `TS2305 Module '@owlmeans/x' has no exported member 'Y'` — but `packages/x/build/*.d.ts` is fresh and correct | `@owlmeans/*` | published tarball of an older version, from a mid-version-bump install |
| `TS2769 No overload matches this call` on MUI `Stack`/`Box` props in one package only | `@mui/material` | a `devDependencies` range that outran the `peerDependencies` range — the package typechecks against a major it does not declare support for |
| Browser specs all fail with `Target page, context or browser has been closed`, browser log shows `Incompatible React versions` | `react-dom` | stale nested copy left one patch behind the root, and React demands exact-equal `react`/`react-dom` |
| One nested copy per package — `packages/*/node_modules/typescript`, at an older major than the root | `typescript` | a **build-time** dep whose range moved: `bun install` adds the nested copy while the ranges disagree and never prunes it afterwards. Nothing fails loudly — each package compiles with its own `tsc`, so it shows up only as `.d.ts` typechecked by the wrong compiler. Sweep the stale copies after raising the range |
| `TS2322 … Two different types with this name exist, but they are unrelated` on plain `<div>` props or `CSSProperties` | `@types/react` | the two repos resolved different patches of the same `^` range. Type identity is per-declaration-file, so one patch apart is enough. `bun update @types/react @types/react-dom` in **every** repo, then confirm they match |

**A linked repo may be on a different compiler major, and that is not a copy to sweep.** `common`,
`internal`, `viable` and `viable-agent` all declare `typescript: ^7.0.2`. `static` lists five of
this repo's packages as workspace entries (`dep-config`, `consent`, `web-consent`, `web-gtm`,
`astro`) while declaring `typescript: ^5.8.3` in its own manifests, so wherever its
`libraries/common` link is in place a TypeScript 5 compiler reads this repo's emitted `.d.ts`.
Read the consumer's own manifest before deciding a nested copy is stale, and keep emitted
declarations readable by the oldest compiler a linked repo declares.

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
