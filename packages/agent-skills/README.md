# @owlmeans/agent-skills

CLI installer that lifts embedded Claude Code skills and GitHub Copilot instructions
out of installed `@owlmeans/*` packages and places them into your project's native
agent-guidance locations.

## Usage

After installing `@owlmeans/*` packages, run once:

```sh
npx @owlmeans/agent-skills
```

The installer scans `node_modules/@owlmeans/*/agent-meta/`, shows you what guidance
is available, and (with your confirmation) copies it into:

- **Claude Code**: `.claude/skills/<name>/SKILL.md`
- **GitHub Copilot**: `.github/instructions/<name>.instructions.md`

Re-run after updating `@owlmeans/*` packages to pick up revised guidance.

## Flags

```
--dir <path>        target project directory (default: current working directory)
--yes, -y           skip interactive confirmation (non-destructive; conflicts still skip)
--only <pkg,...>    install guidance from these packages only (comma-separated @owlmeans/* names)
--claude-only       install only Claude Code skills (.claude/skills/)
--copilot-only      install only Copilot instructions (.github/instructions/)
--extras            include extras bundled in the installer itself (default: on)
--no-extras         skip extras bundled in the installer
--force             overwrite locally-edited files (no AUTO-GENERATED banner)
--dry-run           print plan without writing any files
--help, -h          show this help
```

## Conflict policy

Files managed by the installer carry an `AUTO-GENERATED` banner. On re-run:

- **Managed files** (banner present) — always updated to the latest embedded version.
- **Locally-edited files** (no banner) — **skipped** and reported as conflicts by default.
  Pass `--force` to overwrite, or confirm individually in interactive mode.

## Extras (shadcn)

The installer ships `shadcn-web` and `shadcn-versions` as bundled extras — design
system guidance that spans multiple packages and has no single lead package. These
are installed by default alongside package-specific guidance from `node_modules`.

## Linked monorepo

If any `@owlmeans/*` packages are **symlinked** (e.g. via a `libraries/` workspace
link in an OwlMeans monorepo), the installer refuses and exits with code 4. In that
setup agents already load guidance from the linked monorepo's root `.claude/skills/`
and `.github/instructions/` — running the installer would install stale copies.

Pass `--force` only if you understand this and want to proceed anyway.

## Schema

Each `@owlmeans/*` package ships its embedded guidance under:

```
agent-meta/
  manifest.json          # package, version, entries list
  skills/<name>/
    SKILL.md             # Claude Code skill
  instructions/
    <name>.instructions.md   # GitHub Copilot instruction
```

Embedded files are **generated and read-only**. To contribute guidance edits, open
a PR against [owlmeans/common](https://github.com/owlmeans/common).

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded Claude Code skills and GitHub Copilot instructions under
`agent-meta/`. After installing your `@owlmeans/*` packages, run the OwlMeans
agent-skills installer to place them into your project's native locations
(`.claude/skills/` and `.github/instructions/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
