---
node: versioning
scope: "**/package.json"
updated: 2026-08
---

# Versioning

## Facts

- All packages are synchronized at one version (currently `0.1.16`); internal cross-package
  deps use the caret range carrying any prerelease suffix (`^0.1.16`, `^0.1.16-rc.0`).
  `@owlmeans/dep-config` is always `workspace:*` (config-only, no runtime code).
- Bump ALL packages at once — commands in the `versions` skill.
- Version fields and caret ranges must be rewritten in one pass before `bun install`. An install
  run while they disagree (or against a range left at an older version) finds no workspace match,
  fetches the old published tarballs into `packages/*/node_modules/@owlmeans/*`, and those shadow
  the root workspace symlinks — producing bogus `TS2305 has no exported member` errors monorepo-wide
  that survive later installs. Prune with `rm -rf packages/*/node_modules/@owlmeans`.
- **Nested shadowing is not limited to `@owlmeans/*`.** Any dep whose package-level range the
  hoisted root copy cannot serve gets a real `packages/<pkg>/node_modules/<dep>` that wins locally
  and is never pruned — seen with `@mui/material` (dev range `^9` outran peer range `^7*`, giving
  TS2769 on `Stack`/`Box` in `mui-panel` alone) and `react-dom` (stale patch shadowing root, which
  breaks every browser spec since React demands exact-equal `react`/`react-dom`). Keep each
  package's `devDependencies` inside its own `peerDependencies` range; Dependabot's dev-dependency
  group bumps ignore that pairing. Full diagnosis recipe in the `bun` skill.
- `bun.lock` is gitignored — dependency-bump merges never conflict on it, and every `bun install`
  silently re-resolves floating ranges.
- Root `overrides` pins `bson` to `7.2.0`. `bson >= 7.3.0` calls
  `v8.startupSnapshot.isBuildingSnapshot()` in a static initializer, unimplemented in every Bun
  through 1.3.14, so `import 'mongodb'` throws before any OwlMeans code runs — a **runtime** break
  under Bun, not just a test one. `mongodb@7.5.0` allows `^7.2.0`, so the pin is in-range. Downstream
  `viable` is still on `mongodb@6.21.0`/`bson@6.10.4` and unaffected.
  Bun **1.4.0** (the pinned toolchain since this repo moved off 1.3.14) implements the call, so the
  override no longer decides whether the server boots — it is retained for older runtimes only.
- Dependabot branches are cut from stale bases, so their conflicts are always "stale neighbour"
  lines (old `@owlmeans/*` ranges, old sibling deps) rather than real disagreements. Resolve by
  taking `main` for every line and applying only the one dependency the branch exists to bump.
- The 14 crypto-adjacent packages run `@scure/base` **v2** (ESM-only, no CJS build; strict `utf8`
  that throws instead of emitting `U+FFFD`). v1 stays in the tree under `@scure/bip39@1.x`, which
  still pins `~1.2.5` — the two coexist harmlessly since the coders are pure. Consumer-facing
  consequences live in the `basic-keys` skill.
- Native packages moved to the separate `native` monorepo; consumed from there via library links.
- Downstream repos (`viable`, `viable-agent`, `internal`) symlink `@owlmeans/*` from
  `common/packages/*` (bun hoisted linker) — rebuilding common propagates without publishing.
