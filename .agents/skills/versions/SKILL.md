---
name: versions
description: Version format and internal dependency ranges in the OwlMeans Common monorepo. Versions are per package and intentionally uneven — releasing is the publishing skill. Use when checking a version, editing internal ranges, or doing a rare whole-repo bump.
allowed-tools: Bash(grep *) Bash(sed *) Bash(bun install)
---

# Versioning — OwlMeans Common

## Version convention

- Versions are **per package and deliberately uneven** — a release bumps only what changed plus its
  dependents, so untouched packages stay behind. That is the intended state; never "resynchronise"
  them. Cutting a release is the `publishing` skill — this one covers the version format itself.
- Check a version, don't assume it (see below)
- All use `@owlmeans/*` namespace with MIT license
- Version is set in each `packages/*/package.json` under the `"version"` field, and in the root `package.json`
- Internal cross-package dependencies reference each other with a caret range matching the current version: `"@owlmeans/error": "^0.1.16"`
- Release candidates use a prerelease suffix (`0.1.17-rc.0`); the caret range carries the suffix too, since a bare `^0.1.17` would not accept a prerelease. Once the final ships, the ranges must lose the suffix again — a downstream repo left on `^0.1.16-rc.0` keeps pulling prereleases

## Checking current version

```bash
grep '"version"' packages/auth/package.json
# or check root
grep '"version"' package.json
```

## Bumping every package at once (rare)

Only for a deliberate whole-repo release — a normal release bumps a subset via the `publishing`
harness (`release.ts --apply`), which also realigns dependent ranges for you. Reach for the manual
sweep below only when every package genuinely must move, e.g. a major/minor rebase of the line.

Replace version in all `package.json` files at once:

Rewrite the `version` fields and the internal caret ranges **in the same pass**, before running
`bun install`. If an install happens while the two disagree, no workspace package satisfies the
new ranges and Bun silently fetches the old published tarballs into
`packages/*/node_modules/@owlmeans/*`, where they shadow the workspace symlinks and break every
subsequent build (see the `bun` skill's troubleshooting section).

```bash
# Example: bump from 0.1.16 to 0.1.17-rc.0
OLD=0.1.16
NEW=0.1.17-rc.0

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

## Publishing after a bump

**Publishing requires the operator's explicit agreement, every time** — see the `publishing` skill,
which owns the release procedure and the harness that enforces it.

Two constraints the harness already handles, worth knowing when publishing by hand:
`npm publish` refuses a prerelease (`X.Y.Z-rc.N`) without an explicit `--tag`, and the convention
here is to publish prereleases straight to `latest` (verify before assuming —
`npm view @owlmeans/<any-package> dist-tags --json`). Anything with `"private": true` (`_tpl`) is
skipped. A same-triple prerelease bump (`-rc.N` → `-rc.N+1`) satisfies existing `^X.Y.Z-rc.N`
ranges, so no consumer manifest needs editing for one — in this monorepo or in a downstream
repo (e.g. a target-project template) already pinned that way.

## Internal dependency references

- Internal packages reference each other as `"@owlmeans/xxx": "^X.Y.Z"` (caret, matching monorepo version)
- `dep-config` is always `"workspace:*"` since it's a dev-only config package with no runtime code
- Never pin internal deps to exact versions — always use caret

## dep-config special case

`@owlmeans/dep-config` is referenced as `"workspace:*"` (not a caret range) in devDependencies of all packages, because it contains no runtime code — only TypeScript config files. Being version-independent, it is the one internal dep a bump never has to touch.

## Install lines in skills

The `**Install:**` line of every package skill states the package's **current** version, and it is
kept true mechanically: `release.ts --apply` (the `publishing` skill) rewrites every such line to
`^<current version>` on each release. Never hand-edit the version in an Install line — state
changes flow from `packages/*/package.json`, through the release apply, into the skill and then
into the embedded agent-meta copies.
