---
node: versioning
scope: "**/package.json"
updated: 2026-08
---

# Versioning

## Facts

- All packages are synchronized at one version (currently `0.1.11`); internal cross-package deps
  use the caret range (`^0.1.11`). `@owlmeans/dep-config` is always `workspace:*` (config-only,
  no runtime code).
- Bump ALL packages at once — commands in the `versions` skill.
- Native packages moved to the separate `native` monorepo; consumed from there via library links.
- Downstream repos (`viable`, `viable-agent`, `internal`) symlink `@owlmeans/*` from
  `common/packages/*` (bun hoisted linker) — rebuilding common propagates without publishing.
