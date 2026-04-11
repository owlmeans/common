---
name: versions
description: How to manage package versions in the OwlMeans Common monorepo. All packages are synchronized at the same version. Use this when bumping versions, checking current version, or updating internal dependency references.
allowed-tools: Bash(grep *), Bash(sed *), Bash(bun install)
---

# Versioning — OwlMeans Common

## Version convention

- All packages are **synchronized at the same version** — currently `0.1.2`
- All use `@owlmeans/*` namespace with MIT license
- Version is set in each `packages/*/package.json` under the `"version"` field
- Internal cross-package dependencies reference each other with a caret range matching the current version: `"@owlmeans/error": "^0.1.2"`

## Checking current version

```bash
grep '"version"' packages/auth/package.json
# or check root
grep '"version"' package.json
```

## Bumping all packages to a new version

Replace version in all `package.json` files at once:

```bash
# Example: bump from 0.1.2 to 0.2.0
OLD=0.1.2
NEW=0.2.0

# Update version field in all packages
sed -i "s/\"version\": \"$OLD\"/\"version\": \"$NEW\"/g" packages/*/package.json

# Update internal dep references (caret ranges)
sed -i "s/\"\^$OLD\"/\"^$NEW\"/g" packages/*/package.json

# Re-link workspace
bun install
```

## Internal dependency references

- Internal packages reference each other as `"@owlmeans/xxx": "^X.Y.Z"` (caret, matching monorepo version)
- `dep-config` is always `"workspace:*"` since it's a dev-only config package with no runtime code
- Never pin internal deps to exact versions — always use caret

## dep-config special case

`@owlmeans/dep-config` is referenced as `"workspace:*"` (not `^0.1.2`) in devDependencies of all packages, because it contains no runtime code — only TypeScript config files.
