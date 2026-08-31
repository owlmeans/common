---
name: nested-agent-context
description: "MANDATORY when planning any work under libraries/* or apps/*. Runs the discovery script to enumerate the agent guidance of each linked OwlMeans monorepo — its AGENTS.md, skills, rules and memory index — then loads everything relevant to the planned change. Embedded per-package agent-meta/ copies are reported as ignored: the linked monorepo's root guidance is authoritative."
allowed-tools: Bash(sh *) Read
user-invocable: true
---

# Nested Agent Context — libraries/* and apps/*

`libraries/` and `apps/` are direct symlinks to separate OwlMeans monorepos.
Each monorepo carries its own `AGENTS.md`, `.agents/skills/` and `.agents/rules/`
trees. Those nested instructions are **authoritative** for any code that lives
inside that child project — they must be read before making any changes there.

## Mandatory pre-work (MUST follow before any edit)

Before editing, creating, or deleting any file under `libraries/<name>/` or
`apps/<name>/`:

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

A child that has not migrated to `AGENTS.md` yet is listed with `[legacy-*]`
labels (`[legacy-copilot]`, `[legacy-claude]`, `[legacy-skill]`,
`[legacy-instr]`, `[legacy-rule]`) — read those the same way.

### Step 3 — Also read the child's memory index

Open the `[memory-index]` file printed by the script
(e.g. `libraries/common/.agents/memory/MEMORY.md`) to get the child
project's current state and relevant knowledge. A `[legacy-memory]`
entry means the child still uses the retired `.claude/memory/` store —
read it the same way, but flag the child for `memory-recompact` migration.

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

## Output format

```
== libraries/common ==
    [agents-md]      libraries/common/AGENTS.md
                     -- OwlMeans Common — Project Context
    [skill]          libraries/common/.agents/skills/context/SKILL.md
                     -- Context DI container skill
    [rule]           libraries/common/.agents/rules/git.md
    [memory-index]   libraries/common/.agents/memory/MEMORY.md
    [embedded]       76 package(s) ship packages/*/agent-meta/ — IGNORED here
                     -- linked context: root AGENTS.md and skills above are authoritative; embedded copies serve standalone npm consumers only
```

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
