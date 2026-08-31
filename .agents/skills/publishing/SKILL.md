---
name: publishing
description: How to cut a release of the OwlMeans Common monorepo — detect which packages really changed against the registry, bump only those plus their dependents, and publish exactly that set. Use when releasing, bumping versions, or publishing any @owlmeans/* package.
---

# Releasing OwlMeans Common

## Never publish without being told to

**Publishing is irreversible, public, and affects every downstream consumer. Ask the operator and
get an explicit yes before running the publish step — every time, no exceptions.** A code change
being finished is not permission to release it; neither is a previous release in the same session.
Plan and version-write steps are safe to run unasked, and are the right thing to show the operator
when proposing a release.

The harness enforces this from its side too: `--publish` refuses to run without `--confirm`.

## Release only what changed

A package whose shipped content is identical to what is already on the registry **keeps its version
and is not republished**. What ships is the changed packages plus everything that depends on them,
transitively — dependents must ship because their `@owlmeans/*` ranges have to move with the bump.

Versions across the monorepo are therefore **deliberately not uniform**: after a release, untouched
packages sit at older versions than released ones. That is the intended state, not drift to repair.
Do not "resynchronise" versions — a blanket bump republishes ~90 packages to ship one fix, and every
downstream lockfile churns for nothing.

## The harness

```bash
# 1. What would ship? (default; safe, read-only)
bun .agents/skills/publishing/scripts/release.ts

# 2. Write the new versions, realign dependent ranges, and reconcile every canonical
#    skill's **Install:** line with its package's current version (no registry writes)
bun .agents/skills/publishing/scripts/release.ts --apply

# 3. Rebuild against the new versions, then verify
bun install && bun run build

# 4. Publish — ONLY after the operator agreed to it
bun .agents/skills/publishing/scripts/release.ts --publish --confirm
```

| Option | Effect |
|---|---|
| `--baseline <version>` | Compare against this exact published version instead of the dist-tag |
| `--tag <dist-tag>` | Registry tag to compare against and publish to (default `latest`) |
| `--set <version>` | Force one version for every affected package instead of bumping |
| `--all` | Treat everything as changed — a full synchronized release |
| `--only <a,b,c>` | Treat exactly these as changed, skipping content comparison |
| `--json` | Emit the plan as JSON |
| `--concurrency <n>` | Parallel registry operations (default 8) |

Whole-repo comparison takes well under a minute, so run the plan rather than reasoning about what
you think changed.

`--apply` also sweeps `.agents/skills/*/SKILL.md`: every `**Install:**` line naming an
`@owlmeans/*` package is rewritten to `^<that package's current version>`, across ALL skills, not
only the bumped set. Install lines are therefore **generated bookkeeping — never hand-maintain a
version there**, and never "fix" one in a docs-only change: the next `--apply` is what fixes it.
After an apply, re-run the agent-meta sync so the embedded copies follow the canonical text.

## How "changed" is decided

Against **the registry**, not git: the question a release answers is "does what I would publish
differ from what is published", and that stays answerable with a dirty tree, no tags and no release
branch — none of which this repo has (it carries zero tags). For each package the harness hashes
the exact file set `npm publish` would upload (`npm pack --dry-run`) and compares it to the same
hash computed from the published tarball.

Two fields are excluded from that hash, and the tool is useless without the exclusion: a package's
own `version` and its `@owlmeans/*` ranges. Both move mechanically on every bump, so counting them
would report the entire graph as changed forever and collapse this back into a blanket release.

Consequences worth knowing:
- A package **never published** counts as changed, so new packages release on their first run.
- A package whose local hash cannot be computed is treated as changed. Shipping something
  unnecessary is recoverable; silently skipping a real change is not.
- Because `build/` is part of the published file set, **build before planning** — a stale `build/`
  makes the plan describe the wrong thing.

## Ordering, cycles and ranges

Dependencies publish before dependents; the graph's known SCCs are emitted in a stable arbitrary
order, which is fine because npm does not check dependency availability at publish time. Range
rewrites stay inside the released set by construction: anything depending on a bumped package is
itself a dependent and therefore also being released, so a package left behind keeps ranges that
still resolve. `workspace:` / `file:` / `link:` ranges — notably `@owlmeans/dep-config` — carry no
version and are never touched.

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

## Related

- [[versions]] — version format, caret ranges, the `dep-config` exception
- [[bun]] — install/link behaviour and mixed-version troubleshooting
- [[dependency-tree]] / `tree.md` — the package graph this harness walks
