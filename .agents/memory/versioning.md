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
- Versions are NOT uniform after a release — only what changed (plus what must move with it) is
  bumped; `publishing` skill. The published tarballs of the 2026-09-17 batch carry compiled files of
  sources deleted on 2026-09-11 (an uncleaned `build/`), so a local-vs-registry diff shows
  "registry-only" files that are dead leftovers, not content this tree lacks. Post-release commits
  (README install lines, the `owlmeans-` agent-meta renames) then make ~20 root packages "changed"
  and their dependents (~90) follow, so a full plan is ~110 packages: expected, not a misconfigured
  checkout. Scoping a release to one change is a deliberate manual act (see the skill).
- A caret on a `0.0.x` version is exact (`^0.0.23` does not admit `0.0.24`): bumping `viable-common`
  means moving every consumer pin (viable, viable-agent, internal) in the same sweep.
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
- **A lockfile's `workspaces` entries keep the ranges they were first written with.** Bun 1.4 never
  rewrites a workspace entry's declared range when only the manifest's range moves — `bun install`,
  `--lockfile-only` and `--frozen-lockfile` all answer "no changes" — so after a release sweep the
  lock still says `^0.0.19` beside a manifest at `^0.0.22` (hundreds of such lines per repo).
  Resolution is unaffected (workspace links); the text is simply stale. Aligning it is a text edit
  of those range strings, validated by `bun install --frozen-lockfile --dry-run`.
- `bson` carries **no override** — it resolves freely (7.3.x) inside `mongodb`'s `^7.2.0` range,
  in common, internal, viable and viable-agent alike. It could not before: `bson >= 7.3.0` calls
  `v8.startupSnapshot.isBuildingSnapshot()` in a static initializer, unimplemented in every Bun
  through 1.3.14, so `import 'mongodb'` threw before any OwlMeans code ran — a **runtime** break,
  not just a test one. Bun **1.4.0** implements it, which is what made the pin removable. The
  dependency is now on the Bun floor: drop a runtime below 1.4.0 and the crash returns, with builds
  and unit suites still green.
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
