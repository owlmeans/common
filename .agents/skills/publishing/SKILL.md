---
name: publishing
description: How to cut a release of the OwlMeans Common monorepo — detect which packages really changed against the registry, bump only those plus their dependents, and publish exactly that set under the right dist-tag. Use when releasing, bumping versions, or publishing any @owlmeans/* package.
---

# Releasing OwlMeans Common

## Never publish without being told to

**Publishing is irreversible, public, and affects every downstream consumer. Ask the operator and
get an explicit yes before running the publish step — every time, no exceptions.** A code change
being finished is not permission to release it; neither is a previous release in the same session.
Plan and version-write steps are safe to run unasked, and are the right thing to show the operator
when proposing a release.

The harness enforces this from its side too: a plan is `--dry-run`, and the local `release.ts`
entry point refuses `--publish` without `--confirm`.

## One harness, in library-manager

The release tooling lives in the **library-manager** workspace, cloned alongside this monorepo:
`library-manager/scripts/publish.ts` over `library-manager/scripts/lib/release-engine.ts`. It is
the only definition of "changed", of the bump rule, and of the dist-tag rule, and it serves every
OwlMeans repo.

`.agents/skills/publishing/scripts/release.ts` is a thin shim: it translates the old flags,
delegates to that harness, and afterwards reconciles this repo's canonical `**Install:**` lines.
Prefer running the harness directly when you are in the library-manager tree.

```bash
cd ../library-manager

# 1. What would ship, and under which dist-tag? (safe, read-only)
bun run scripts/publish.ts --project common --dry-run

# 2. Give each affected package a version that is not taken, and realign
#    every dependent range in-repo (^ and ~ are preserved)
bun run scripts/publish.ts --project common --bump rc

# 3. Rebuild against the new versions, sync embedded guidance, commit
( cd projects/common && bun install && bun run build )
bun run scripts/sync-agent-meta.ts --project common
( cd projects/common && git add -A && git commit -m "chore: rc bump" )

# 4. Publish — ONLY after the operator agreed to it
bun run scripts/publish.ts --project common

# 5. Sweep every consumer, then prove none was missed
bun run scripts/bump-deps.ts --consumers-of common
bun run scripts/bump-deps.ts --consumers-of common --check
```

| Option | Effect |
|---|---|
| `--changed` | Ship what differs from the registry plus its dependents (**default**) |
| `--all` | Treat everything as changed — a full synchronized release |
| `--bump rc` | Step the prerelease of each affected package, realign ranges, then stop |
| `--tag <dist-tag>` | Force one tag; without it, `auto` picks per package |
| `--filter <glob>` | Narrow which packages are looked at (never which ones the closure obliges) |
| `--concurrency <n>` | Parallel registry operations (default 8) |
| `--dry-run` | Print the plan; write nothing, publish nothing |

The equivalent through the shim, from this repo: no flags = plan, `--apply` = `--bump rc`,
`--publish --confirm` = publish. `--baseline`, `--set`, `--only` and `--json` are gone — the engine
compares each package against the version it declares and derives the next one.

Whole-repo comparison of ~100 packages takes about 20 seconds, so run the plan rather than
reasoning about what you think changed.

## Release only what changed

A package whose shipped content is identical to what is already on the registry **keeps its version
and is not republished**. What ships is the changed packages plus everything that depends on them,
transitively — dependents must ship because their `@owlmeans/*` ranges have to move with the bump.

Versions across the monorepo are therefore **deliberately not uniform**: after a release, untouched
packages sit at older versions than released ones. That is the intended state, not drift to repair.
Do not "resynchronise" versions — a blanket bump republishes ~90 packages to ship one fix, and every
downstream lockfile churns for nothing.

## How "changed" is decided

Against **the registry**, not git: the question a release answers is "does what I would publish
differ from what is published", and that stays answerable with a dirty tree, no tags and no release
branch — none of which this repo has (it carries zero tags). For each package the harness hashes
the exact file set `npm publish` would upload (`npm pack --dry-run`, with lifecycle scripts ignored
so planning never mutates the tree) and compares it to the same hash computed from the published
tarball.

Two fields are excluded from that hash, and the tool is useless without the exclusion: a package's
own `version` and its `@owlmeans/*` ranges. Both move mechanically on every bump, so counting them
would report the entire graph as changed forever and collapse this back into a blanket release.

Consequences worth knowing:
- A package **never published**, or one whose declared version is not on the registry, counts as
  changed — a staged release goes out on the next run.
- A package whose local hash cannot be computed is treated as changed. Shipping something
  unnecessary is recoverable; silently skipping a real change is not.
- Because `build/` is part of the published file set, **build before planning** — a stale `build/`
  makes the plan describe the wrong thing.

## Versions and dist-tags

An affected package whose declared version is **already on npm** cannot ship as it stands. A real
run stops with **exit 10** and lists them. `--bump rc` is the answer: it steps each such prerelease
(`0.1.18-rc.7` → `0.1.18-rc.8`; a stable version falls back to a patch step), realigns every
dependent range onto the new versions keeping the operator the author chose, writes the manifests,
and stops — so the tree gets reinstalled, rebuilt and committed before anything is published.
A `--dry-run` shows those rows at the version the bump would give them and exits 0.

The dist-tag defaults to `auto` and is resolved **per package**: a prerelease publishes under
`next`, a stable version under `latest`. That is what keeps this rc train off `latest`. Pass an
explicit `--tag` only to override every row at once.

## Ordering, cycles and ranges

Dependencies publish before dependents; the graph's known SCCs are emitted in a stable arbitrary
order, which is fine because npm does not check dependency availability at publish time. Range
rewrites stay inside the released set by construction: anything depending on a bumped package is
itself a dependent and therefore also being released, so a package left behind keeps ranges that
still resolve. `workspace:` / `file:` / `link:` ranges — notably `@owlmeans/dep-config` — carry no
version and are never touched.

## Install lines are generated bookkeeping

Every package-specific skill here opens with an `**Install:**` line naming its package and a caret
range. `release.ts --apply` rewrites those lines to each named package's current version, across
ALL skills, not only the bumped set. **Never hand-maintain a version there**, and never "fix" one
in a docs-only change: the next apply is what fixes it. After an apply, re-run the agent-meta sync
so the embedded copies follow the canonical text.

## Exit 8 — a skill cites a monorepo path

Each package ships its guidance under `agent-meta/`, read by consumers who installed from npm and
have no monorepo, so a `packages/`-rooted reference points at a tree they do not have. The agent-meta
sync and the publish pre-flight both refuse on it **by default**, listing
`<package>: monorepo paths in <canonical file>: <matches>`.

Fix and re-run the same command — a normal step, not a blocker:

1. Open the **canonical** file named (root `.agents/skills/…`), never a generated `agent-meta/` copy.
2. Name the package and symbol instead of the path — ``see `makeContext` in `@owlmeans/web-client` ``
   rather than a `packages/`-rooted path to that module. Paths inside the consumer's own project
   (`src/…`) are fine.
3. Re-run; each run lists at most 5 matches per file, so repeat until clean.

Fenced code blocks are scanned too. Do not bypass with `--no-strict` / `--skip-agent-meta-check`:
that ships a pointer to a directory the reader does not have.

## After a release

Downstream repos do **not** pick this up on their own. A consumer with a lockfile pinning older
versions keeps them until its ranges are refreshed and it reinstalls — see the `bun` skill's
troubleshooting section for the shadow-copy failure that a half-updated tree produces.

`bump-deps.ts --consumers-of common` sweeps the right set in one command: `internal`,
`viable-agent` and `viable`, plus the two template trees that belong to no workspace (the
viable-agent template and this repo's `create-app` template). `--check` on the same command exits
11 listing any pin that still disagrees, and is the proof the sweep is complete.

### `Published N/N` is not "installable yet"

A green publish means npm accepted the tarballs, not that the registry serves them. For minutes
afterwards `npm view <pkg> dist-tags` can still report the previous version, and an install that
asks for the new one fails with `No version matching "<range>" ... (but package exists)`.

This bites anything that installs from public npm right after a release — most sharply the
viable-agent template gate, which installs into throwaway copies. Because the release realigns
**dependent ranges**, a single package the registry has not caught up on blocks the entire
install, and the packages that are visible resolve fine, so the failure names a package you may
not have touched.

So before running anything that installs the release, wait for every version in the batch — not
just the one you changed:

```sh
for p in client:0.1.18-rc.14 client-socket:0.1.18-rc.12 …; do
  n=${p%%:*}; v=${p##*:}
  [ "$(npm view @owlmeans/$n dist-tags.next 2>/dev/null)" != "$v" ] && echo "lagging: $n"
done
```

Query `dist-tags.next` for an rc train and `dist-tags.latest` for a stable release — that is the
tag the harness published it under. Only once that is silent, drop bun's cached manifests
(`cd ~/.bun/install/cache && grep -la '@owlmeans/' *.npm | xargs -r rm -f`) and install. Purging
**before** the registry has caught up is counterproductive: bun refetches and re-caches the stale
manifest.

## Related

- [[versions]] — version format, caret ranges, the `dep-config` exception
- [[bun]] — install/link behaviour and mixed-version troubleshooting
- [[dependency-tree]] / `tree.md` — the package graph this harness walks
