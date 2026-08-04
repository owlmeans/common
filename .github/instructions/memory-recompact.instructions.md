---
description: "Whole-store memory recompaction and migration for .agents/memory/ — rebuild node map from project structure, merge records, enforce caps, regenerate the index, fold in and delete legacy .claude/memory and .github/memory stores. Apply when restructuring a memory store or migrating legacy stores."
applyTo: "**/.agents/memory/**, **/.claude/memory/**, **/.github/memory/**"
---

# Memory recompaction

Whole-store maintenance for `.agents/memory/` (protocol:
`.github/instructions/agent-memory.instructions.md`). Also the migration procedure for legacy
`.claude/memory/` + `.github/memory/` stores. Store-wide rewrite — propose it when triggers
appear; the operator invokes it.

## When

- An index entry runs longer than one line, or the index exceeds 50 lines.
- Nodes keyed by event/date/phase/task, or bodies reading as session narratives.
- The same fact stated in two or more nodes.
- More than ~20% of a node is stale `Status` content.
- A node's `updated:` is months behind commits touching its scope.
- Legacy `.claude/memory/` or `.github/memory/` dirs exist → run the migration below.

## Build the target node map first

Before reading any record bodies, derive the node set from **project structure**: workspaces
array / top-level dirs → subsystem nodes; then the cross-cutting concerns and external
integrations actually present. Write the map down (old file/section → target node). Every
existing record must land in exactly one node — or split into atoms landing in several. Only
then process records.

## Per-record pass

For each old file or section:

1. Apply the agent-memory extraction rule — keep invariants, cause→effect, counter-moves,
   symptom fingerprints; drop narratives, dates, attempt logs, anything code/git already states.
2. Route each surviving atom to its node's section (Facts / Invariants / Gotchas / Pointers;
   genuinely in-flight state → `Status`, dated).
3. On conflict between records, the version consistent with **current code** wins — check the
   code, don't average.
4. Procedure-shaped survivors do not enter nodes — route them to
   `.github/instructions/memory-promotion.instructions.md`.

## Legacy-store merge (migration)

1. Union `.claude/memory/` and `.github/memory/`. Same-named files are two drifted sources of
   ONE node — merge both; the code-consistent version wins.
2. Index-only entries with no backing file: extract the fact into its node, or drop if stale.
3. Old `## Skills` / "Key Files" index sections are dropped — skills self-describe; harness
   layout belongs to `CLAUDE.md` / `.github/copilot-instructions.md`. Move genuinely non-obvious
   dispatch hints there.
4. When the new store verifies (below), delete both legacy dirs entirely.

## Regenerate the index

Rebuild `MEMORY.md` from the resulting nodes per the agent-memory format — never edit the old
index incrementally.

## Verify

- Every node file is listed in the index; every listed node exists; every wiki-link resolves.
- All caps met (index ≤ 50 lines; nodes ≤ 120; entries ≤ 3 lines; Status ≤ 5 dated lines).
- No dates outside `Status` and `updated:`; no event-keyed filenames.
- Both root instruction files' Memory sections point at `.agents/memory/`.
- Legacy dirs gone; `grep -rn '\.claude/memory\|\.github/memory'` over the repo's harness files
  returns nothing but allowlisted historical mentions.

## Report

One table: **Node** | **Sources merged** | **Lines before → after**. Follow the Reporting rule
(what, not why).
