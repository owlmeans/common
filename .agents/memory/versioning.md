---
node: versioning
scope: "**/package.json"
updated: 2026-08
---

# Versioning

## Facts

- All packages are synchronized at one version (currently `0.1.16-rc.0`); internal cross-package
  deps use the caret range carrying any prerelease suffix (`^0.1.16-rc.0`).
  `@owlmeans/dep-config` is always `workspace:*` (config-only, no runtime code).
- Bump ALL packages at once — commands in the `versions` skill.
- Version fields and caret ranges must be rewritten in one pass before `bun install`. An install
  run while they disagree (or against a range left at an older version) finds no workspace match,
  fetches the old published tarballs into `packages/*/node_modules/@owlmeans/*`, and those shadow
  the root workspace symlinks — producing bogus `TS2305 has no exported member` errors monorepo-wide
  that survive later installs. Prune with `rm -rf packages/*/node_modules/@owlmeans`.
- Native packages moved to the separate `native` monorepo; consumed from there via library links.
- Downstream repos (`viable`, `viable-agent`, `internal`) symlink `@owlmeans/*` from
  `common/packages/*` (bun hoisted linker) — rebuilding common propagates without publishing.
