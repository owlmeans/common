---
name: versions
description: How to manage package versions in the OwlMeans Common monorepo. All packages are synchronized at the same version. Use this when bumping versions, checking current version, or updating internal dependency references.
allowed-tools: Bash(grep *) Bash(sed *) Bash(bun install)
---

# Versioning — OwlMeans Common

## Version convention

- All packages are **synchronized at the same version** — check it, don't assume (see below)
- All use `@owlmeans/*` namespace with MIT license
- Version is set in each `packages/*/package.json` under the `"version"` field, and in the root `package.json`
- Internal cross-package dependencies reference each other with a caret range matching the current version: `"@owlmeans/error": "^0.1.16-rc.0"`
- Release candidates use a prerelease suffix (`0.1.16-rc.0`); the caret range carries the suffix too, since a bare `^0.1.16` would not accept a prerelease

## Checking current version

```bash
grep '"version"' packages/auth/package.json
# or check root
grep '"version"' package.json
```

## Bumping all packages to a new version

Replace version in all `package.json` files at once:

Rewrite the `version` fields and the internal caret ranges **in the same pass**, before running
`bun install`. If an install happens while the two disagree, no workspace package satisfies the
new ranges and Bun silently fetches the old published tarballs into
`packages/*/node_modules/@owlmeans/*`, where they shadow the workspace symlinks and break every
subsequent build (see the `bun` skill's troubleshooting section).

```bash
# Example: bump from 0.1.15 to 0.1.16-rc.0
OLD=0.1.15
NEW=0.1.16-rc.0

# Version field — root and all packages
sed -i "s/\"version\": \"$OLD\"/\"version\": \"$NEW\"/g" package.json packages/*/package.json

# Internal dep references (caret ranges)
sed -i "s/\"\^$OLD\"/\"^$NEW\"/g" packages/*/package.json

# Only now re-link the workspace
bun install
```

Verify the bump left nothing behind before building:

```bash
# every internal range must be the new one (dep-config's workspace:* aside)
grep -ho '"@owlmeans/[a-z0-9-]*": "[^"]*"' packages/*/package.json \
  | grep -v 'workspace:\*' | sed 's/.*: "//;s/"//' | sort -u

# no old published copies shadowing the workspace — must print nothing
find packages/*/node_modules/@owlmeans -maxdepth 1 -mindepth 1 -type d
```

A range left at an older version (`^0.1.11`) is the same trap: a prerelease workspace version does
not satisfy it, so that dependency gets fetched from npm instead of linked.

## Internal dependency references

- Internal packages reference each other as `"@owlmeans/xxx": "^X.Y.Z"` (caret, matching monorepo version)
- `dep-config` is always `"workspace:*"` since it's a dev-only config package with no runtime code
- Never pin internal deps to exact versions — always use caret

## dep-config special case

`@owlmeans/dep-config` is referenced as `"workspace:*"` (not a caret range) in devDependencies of all packages, because it contains no runtime code — only TypeScript config files. Being version-independent, it is the one internal dep a bump never has to touch.
