---
name: nested-agent-context
description: "MANDATORY when planning any work under libraries/* or apps/*. Runs the discovery script to enumerate per-project .github and .claude guidance files from linked OwlMeans monorepos, then loads all instruction and skill files relevant to the planned change."
allowed-tools: Bash(sh *) Read
user-invocable: true
---

# Nested Agent Context — libraries/* and apps/*

`libraries/` and `apps/` are direct symlinks to separate OwlMeans monorepos.
Each monorepo has its own `.github/instructions/`, `.github/copilot-instructions.md`,
`.claude/skills/`, and `.claude/rules/` trees.
Those nested instructions are **authoritative** for any code that lives inside
that child project — they must be read before making any changes there.

## Mandatory pre-work (MUST follow before any edit)

Before editing, creating, or deleting any file under `libraries/<name>/` or
`apps/<name>/`:

### Step 1 — Run the discovery script

The bundled script is at
`.claude/skills/nested-agent-context/scripts/nested-agent-context.sh`.

Scope it to the target child:

```sh
# From the repository root
sh .github/agent-scripts/nested-agent-context.sh -p libraries/<name>
sh .github/agent-scripts/nested-agent-context.sh -p apps/<name>
```

*(The `.github/agent-scripts/` copy and the `.claude/skills/.../scripts/` copy
are identical.  Either can be run; use `.github/agent-scripts/` from the repo
root for consistency.)*

### Step 2 — Read every relevant file

The script output lists every guidance file with its description.
Open and read **every `[instruction]`, `[skill]`, and `[rule]` file**
whose description matches the planned change.
File paths in the output are relative to the repository root.

### Step 3 — Also read the child's memory index

Open the `[memory-index]` file printed by the script
(e.g. `libraries/common/.claude/memory/MEMORY.md`) to get the child
project's current state and relevant history.

### Step 4 — Follow nested instructions as authoritative

Root project instructions continue to apply to:
- Root `package.json` workspace entries.
- Cross-package contracts in shared source directories.
- Deployment and secret files.

For everything else inside the child project, the **child's own
instructions take precedence**.

## Script reference

| Invocation | Behaviour |
|---|---|
| `sh .github/agent-scripts/nested-agent-context.sh` | All roots (`libraries/`, `apps/`) |
| `sh .github/agent-scripts/nested-agent-context.sh -p libraries/common` | Single child |
| `sh .github/agent-scripts/nested-agent-context.sh -r libraries` | Single root |
| `sh .github/agent-scripts/nested-agent-context.sh -h` | Help |

## Output format

```
== libraries/common ==
    [copilot-instructions]  libraries/common/.github/copilot-instructions.md
    [instruction]  libraries/common/.github/instructions/context.instructions.md
                   -- How to use @owlmeans/context ...
    [skill]  libraries/common/.claude/skills/context/SKILL.md
             -- Context DI container skill
    [memory-index]  libraries/common/.claude/memory/MEMORY.md
```

## Scope rules

- The script scans **one level deep** under `libraries/` and `apps/` only.
  It never recurses into a linked monorepo's own nested `libraries/`,
  which prevents symlink loops.
- `apps/` is included pre-emptively; the script no-ops gracefully if it
  doesn't exist.

## Sync note

The discovery script is duplicated in two locations:
- `.github/agent-scripts/nested-agent-context.sh` (canonical, for Copilot)
- `.claude/skills/nested-agent-context/scripts/nested-agent-context.sh` (this skill's bundled copy)

Both must remain byte-identical.  When updating the script, copy the change
to both locations.
