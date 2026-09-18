---
name: nested-agent-context
description: "MANDATORY when planning any work under libraries/* or apps/*. Runs the discovery script to enumerate the agent guidance of each linked OwlMeans monorepo — its AGENTS.md, skills, rules and memory index — then loads everything relevant to the planned change. A child's AGENTS.md, rules and memory must still be read before editing it, even though the skills of the repos it depends on are already loadable by name. Embedded per-package agent-meta/ copies are reported as ignored: the linked monorepo's root guidance is authoritative."
allowed-tools: Bash(sh *), Read
user-invocable: true
---

# Nested Agent Context — libraries/* and apps/*

`libraries/` and `apps/` are ordinary directories whose **direct children** are the
separate projects: under `libraries/`, each child is a symlink to another OwlMeans
monorepo; under `apps/`, a child may be a symlink or an application directory that
lives in this repo. Each child carries its own `AGENTS.md`, `.agents/skills/` and
`.agents/rules/` trees. Those nested instructions are **authoritative** for any code that lives
inside that child project — they must be read before making any changes there.

## Mandatory pre-work (MUST follow before any edit)

Before editing, creating, or deleting any file under `libraries/<name>/` or
`apps/<name>/`. Skills alone are not enough: `link-skills.sh` makes every
dependency's skills loadable by name from anywhere in the chain, but a child's
`AGENTS.md`, `.agents/rules/` and memory index are **not** linked and must be read
here.

### Step 1 — Run the discovery script

```sh
# From the repository root
sh .agents/skills/nested-agent-context/scripts/nested-agent-context.sh -p libraries/<name>
sh .agents/skills/nested-agent-context/scripts/nested-agent-context.sh -p apps/<name>
```

### Step 2 — Read every relevant file

The script output lists every guidance file with its description.
Open and read the `[agents-md]` entry plus **every `[skill]`, `[rule]` and
`[doc]` file** whose description matches the planned change.
File paths in the output are relative to the repository root.

A child that does not carry the `AGENTS.md` + `.agents/` layout is listed with a
`[legacy-*]` label —
`[legacy-copilot]`, `[legacy-claude]`, `[legacy-skill]`, `[legacy-instr]`,
`[legacy-rule]`. Each is emitted only when its migrated counterpart is absent,
so a migrated child never double-lists. Read them the same way.

### Step 3 — Also read the child's memory index

Open the `[memory-index]` file printed by the script
(e.g. `libraries/common/.agents/memory/MEMORY.md`) to get the child
project's current state and relevant knowledge. A `[legacy-memory]`
entry means the child keeps its memory in `.claude/memory/` instead of
`.agents/memory/` — read it the same way, and flag the child for a
`memory-recompact` fold-in.

### Step 4 — Follow nested instructions as authoritative

Root project instructions continue to apply to:
- Root `package.json` workspace entries.
- Cross-package contracts in shared source directories.
- Deployment and secret files.

For everything else inside the child project, the **child's own
instructions take precedence**.

## Script reference

The bundled script is `.agents/skills/nested-agent-context/scripts/nested-agent-context.sh`
(one copy, reachable by every agent).

| Invocation | Behaviour |
|---|---|
| `sh .agents/skills/nested-agent-context/scripts/nested-agent-context.sh` | All roots (`libraries/`, `apps/`) |
| `… -p libraries/common` | Single child |
| `… -r libraries` | Single root |
| `… -h` | Help |
| `… -p libraries/absent` | Prints the header plus `(directory not found — nothing to enumerate)` |

Exit status is 0 for a normal run — including one that finds nothing and one scoped
with `-p` to a child that does not exist. It is 1 when an option is unknown, when
`-p` or `-r` is given without its argument, and when no `AGENTS.md` (or
`.github/copilot-instructions.md`) is found above the script; each writes the reason
to stderr.

## Output format

Entries are emitted in a fixed order — `[agents-md]`, `[skill]`, `[linked]`,
`[rule]`, `[doc]`, `[embedded]`, `[memory-index]` — and a label is printed only
when the child actually carries it. `[skill]`, `[rule]`, `[doc]`, `[memory-index]` and
the `[legacy-copilot]`, `[legacy-skill]`, `[legacy-instr]`, `[legacy-rule]` and
`[legacy-memory]` entries take their description from the file's YAML `description:`
and fall back to its first markdown heading. `[agents-md]` and `[legacy-claude]` always
use the first markdown heading — neither reads frontmatter.

```
== libraries/internal ==
    [agents-md]      libraries/internal/AGENTS.md
                     -- OwlMeans Internal — Project Context
    [skill]          libraries/internal/.agents/skills/kephemeral/SKILL.md
                     -- How to consume @owlmeans/kephemeral — the service that ensures and deletes …
    [linked]         113 skill(s) linked from common
                     -- already discoverable by name; index: libraries/internal/.agents/linked-skills/INDEX.md
    [rule]           libraries/internal/.agents/rules/git.md
                     -- Git Workflow Rules
    [doc]            libraries/internal/.agents/project-structure.md
                     -- OwlMeans Internal — Detailed Project Structure
    [memory-index]   libraries/internal/.agents/memory/MEMORY.md
                     -- Memory Graph — internal
```

The `[linked]` line carries the index path of the child being scanned, and one
line is printed per origin repo. A child that publishes packages adds an
`[embedded]` line ahead of `[memory-index]`:

```
    [embedded]       90 package(s) ship packages/*/agent-meta/ — IGNORED here
                     -- linked context: root AGENTS.md and skills above are authoritative; embedded copies serve standalone npm consumers only
```

## Linked skills are counted, never listed

`.agents/scripts/link-skills.sh` mirrors every upstream skill a repo depends on
into that repo's `.agents/linked-skills/<name>` and `.claude/skills/<name>`, and
records them in `.agents/linked-skills/INDEX.md`. Upstreams are the `<dep>` of each
`libraries/<dep>/packages/...` workspace entry in the repo's `package.json`, walked
breadth-first into each upstream's own manifest (depth cap 4) — so an upstream's
upstream is linked too, and every skill it carries is loadable by name in the repo you
are sitting in.

Name collisions resolve in one order: a local skill always wins, then the first upstream
to claim the name — nearer depth first, and inside one depth level the order the
`libraries/*` entries appear in `package.json`. The OwlMeans repos declare every upstream
directly rather than inheriting it, so they all sit at depth 1 and manifest order decides:
`viable` lists `common`, `internal` and `viable-agent` itself, and its generated
`INDEX.md` header reads `Dependency order: common -> internal -> viable-agent`. Read that
header rather than assuming a chain — it is the shadowing order that run actually used.

The discovery script therefore never enumerates the entries of a child's
`.agents/linked-skills/` one by one. It resolves each symlink to the repo that owns it,
counts them per origin, and prints one `[linked] N skill(s) linked from <dep>` line for
each — counts, not a reading list. `.claude/skills/` is not counted at all; it is the
Claude Code mirror of the same two sets and stays unread as long as the child has
`.agents/skills/`.

- To read a dependency skill, load it by name (`/<name>`) or open
  `<repo>/.agents/linked-skills/<name>/SKILL.md`; the index table names the origin
  repo of each.
- The count tells you which upstream vocabularies a child already carries — use it
  to decide which skill names are worth loading, not which files to open.
- `AGENTS.md`, `.agents/rules/` and `.agents/memory/` are **not** linked. They stay
  per-repo and remain mandatory reading before editing that repo.

## Embedded agent-meta copies are ignored

Published `@owlmeans/*` packages ship **embedded copies** of the canonical root
skills under `packages/<pkg>/agent-meta/` (a generated, version-matched
`manifest.json` + `skills/<name>/SKILL.md`). Those copies exist **only to serve
standalone npm consumers** who install a package outside the monorepo.

**In a linked context they are ignored.** When a monorepo is reached via a
`libraries/` symlink, its root `AGENTS.md` and `.agents/skills/` are
authoritative; the embedded per-package copies are redundant (and may lag the
root between releases). The discovery script never opens them — it only **counts**
them and prints a single `[embedded] … IGNORED` line so the omission is explicit.

- Read and follow the `[agents-md]` / `[skill]` / `[rule]` entries (root guidance).
- Never open or act on a `packages/<pkg>/agent-meta/` copy in linked work.
- Embedded copies are generated and read-only — guidance edits go to the canonical
  root skill files at the monorepo root, which are re-embedded into packages at
  publish time. The linked monorepo's own docs describe the full schema.

## Scope rules

- The script scans **one level deep** under `libraries/` and `apps/` only.
  It never recurses into a linked monorepo's own nested `libraries/`,
  which prevents symlink loops.
- `apps/` is included pre-emptively; the script no-ops gracefully if it
  doesn't exist.
- `packages/<pkg>/agent-meta/` copies are detected one level deep
  (`packages/*`) and reported as ignored; they are never opened.
- A child's `.agents/linked-skills/` is a generated mirror of its upstreams' skills:
  counted per origin repo, never enumerated as the child's own guidance, which keeps
  one upstream skill from being listed once per repo in the chain.
- `.claude/skills/` is the generated Claude Code mirror and is never counted. It is
  read only by the legacy branch — when the child has no `.agents/skills/` at all —
  and even there a name that also exists in `.agents/linked-skills/` is skipped, so an
  upstream skill is never listed as the child's own.
