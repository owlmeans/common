---
name: versions
description: Version format and internal dependency ranges in the OwlMeans Common monorepo. Versions are per package and intentionally uneven — releasing is the publishing skill. Use when checking a version, editing internal ranges, or doing a rare whole-repo bump.
allowed-tools: Bash(grep *), Bash(sed *), Bash(bun install)
---

# Versioning — OwlMeans Common

## Version convention

- Versions are **per package and deliberately uneven** — a release bumps only what changed plus its
  dependents, so untouched packages stay behind. That is the intended state; never "resynchronise"
  them. Cutting a release is the `publishing` skill — this one covers the version format itself.
- Check a version, don't assume it (see below)
- All use `@owlmeans/*` namespace with MIT license
- Version is set in each `packages/*/package.json` under the `"version"` field, and in the root `package.json`
- Internal cross-package dependencies reference each other with a caret range naming the version
  the depended-on package carries in its own `package.json` — `"@owlmeans/error": "^<version>"`.
  Read that version, never carry one over from another manifest
- Release candidates use a prerelease suffix (`0.1.17-rc.0`); the caret range carries the suffix too, since a bare `^0.1.17` would not accept a prerelease. Once the final ships, the ranges must lose the suffix again — a downstream repo left on `^0.1.16-rc.0` keeps pulling prereleases

## Checking current version

```bash
grep '"version"' packages/auth/package.json
# or check root
grep '"version"' package.json
```

## Bumping every package at once (rare)

Only for a deliberate whole-repo release — a normal release bumps a subset via the `publishing`
harness (`release.ts --apply`), which also realigns dependent ranges for you. When every package
genuinely must move, the harness in the library-manager workspace owns it, in two forms that differ
in exactly what they write:

```bash
# in the library-manager workspace

# A. step each package's own prerelease counter AND realign every intra-repo range
bun run scripts/set-versions.ts --project common --bump rc --dry-run
bun run scripts/set-versions.ts --project common --bump rc

# B. put every package on one explicit version — writes `version` fields and nothing else
bun run scripts/set-versions.ts --project common:0.2.0 --dry-run
bun run scripts/set-versions.ts --project common:0.2.0
```

`--bump rc` derives the next version per package (`0.1.18-rc.7` → `0.1.18-rc.8`; a stable version
falls back to a patch step), then rewrites every `@owlmeans/*` range that names a bumped package
onto that package's new version, keeping whatever operator the range already carried. Realignment
runs over every owned package, not only the ones a `--filter` selected. This is the form an rc train
needs, and the only form that touches ranges at all.

The `<repo>:<version>` form assigns that version to every owned, non-`_tpl` package, skipping the
ones already at it, and **leaves every intra-repo range untouched**. So it must be paired with the
range sweep below in the same pass — otherwise no workspace package satisfies the ranges any more,
which is exactly the trap described next.

Both forms refuse to write into a repo with uncommitted changes: each target project goes through
the dirty-repo guard and a dirty one **exits 3**, printing `git status --porcelain`. Commit first,
or pass `--force`. `--dry-run` skips the guard, so a preview always runs.

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

Constraints the harness already handles, worth knowing when reading a version:

- **Dist-tags are resolved per package.** A prerelease (`X.Y.Z-rc.N`) publishes under `next`, a
  stable version under `latest`, so an rc train never takes over `latest`. Confirm what a package
  actually carries with `npm view @owlmeans/<package> dist-tags --json`.
- **A range resolves by version and ignores dist-tags.** That is what makes `next` safe: a consumer
  pinning `^0.1.18-rc.0` receives rc.12 as soon as it is published, even while `latest` still points
  somewhere older.
- Anything with `"private": true` (`_tpl`) is skipped.
- A same-triple prerelease bump (`-rc.N` → `-rc.N+1`) satisfies existing `^X.Y.Z-rc.N` ranges, so no
  consumer manifest needs editing for one — in this monorepo or in a downstream repo (e.g. a
  target-project template) already pinned that way.

## Internal dependency references

- Internal packages reference each other as `"@owlmeans/xxx": "^X.Y.Z"` (caret, matching monorepo version)
- Never pin internal deps to exact versions — always use caret
- `dep-config` is the exception: `"workspace:*"` in devDependencies (see below)

## Every range must name a version

A `@owlmeans/*` dependency that resolves through a **dist-tag** or nothing at all is a defect, and
it is checked, not merely conventional. `bun add @owlmeans/x` writes `^<latest>` — the version
before the release, on an rc train. `"next"`, `"latest"`, `"*"` and `""` resolve a tag on every
install. All four ship a release nobody receives, in a tree that builds and tests green against the
previous API, and none of them fails loudly.

So a range is written explicitly, and audited:

```bash
# in the library-manager workspace — audits every @owlmeans/* range in the linked worktree
bun run scripts/bump-deps.ts --pins-only          # exit 12 on a violation
bun run scripts/bump-deps.ts --pins-only --fix    # rewrites the documented pins and install commands
```

A release runs the same audit as a pre-flight and refuses over a violation. `workspace:`, `file:`
and `link:` are legitimate **inside a real workspace** and are left alone; inside a template tree
they fail, because a scaffolded project has no such workspace.

**Prerelease satisfaction is stricter than the numbers suggest.** A prerelease matches a range only
when some comparator names the same `[major, minor, patch]` tuple *and* itself carries a
prerelease: `^0.1.18-rc.0` admits `0.1.18-rc.12`, while `^0.1.17-rc.3` admits nothing on the
`0.1.18` line and a bare `^0.1.18` admits no rc at all. A range left behind an older triple is
therefore not "slightly stale" — it is unsatisfiable. Inside the workspace that means Bun stops
linking the local package and fetches an old published tarball into
`packages/*/node_modules/@owlmeans/*` instead; outside it, the install fails.

## dep-config special case

`@owlmeans/dep-config` is referenced as `"workspace:*"` (not a caret range) in the devDependencies
of packages under `packages/*`, because it contains no runtime code — only TypeScript config files.
Being version-independent, it is the one internal dep a bump never has to touch. The published
test-helper packages (`test`, `test-integration`, `test-ui`) carry a caret range instead, since they
are installed from the registry into trees that have no workspace to resolve.

## Install lines in skills

The `**Install:**` line of every package skill states the package's **current** version, and it is
kept true mechanically: `release.ts --apply` (the `publishing` skill) rewrites every pin on every
such line to `^<current version>`, across all skills rather than only the bumped set. The general
form — every repo, and the install *commands* in READMEs and skills too — is
`bump-deps.ts --pins-only --fix` in the library-manager harness. Never hand-edit the version in an
Install line: state changes flow from `packages/*/package.json`, through the release apply, into the
skill and then into the embedded agent-meta copies. A skill with no Install line at all is reported
by the audit, because an agent reading it can only add a bare dependency.
