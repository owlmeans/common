---
name: memory-recompact
description: Recompact a whole .agents/memory/ store — rebuild the node map from project structure, merge event-shaped records into subsystem nodes, deduplicate, enforce caps, regenerate the MEMORY.md index, and fold in memory records kept anywhere else. Use when a store degrades into event logs, when indexes bloat or conflict, or when scattered records have to become one store.
disable-model-invocation: true
metadata:
  scope: general
---

# Memory recompaction

Whole-store maintenance for `.agents/memory/` (protocol: `agent-memory`), and the procedure for
folding records kept anywhere else into it. Store-wide rewrite — propose it when triggers appear;
the operator invokes it.

## When

- An index entry runs longer than one line, or the index exceeds 50 lines.
- Nodes keyed by event/date/phase/task, or bodies reading as session narratives.
- The same fact stated in two or more nodes.
- More than ~20% of a node is stale `Status` content.
- A node's `updated:` is months behind commits touching its scope.
- Memory records live outside `.agents/memory/` — a second store, a per-agent directory, a stray
  notes file → fold them in with the merge pass below.

## Build the target node map first

Before reading any record bodies, derive the node set from **project structure**: workspaces
array / top-level dirs → subsystem nodes; then the cross-cutting concerns and external
integrations actually present. Write the map down (old file/section → target node). Every
existing record must land in exactly one node — or split into atoms landing in several. Only
then process records.

## Per-record pass

For each old file or section:

1. Apply the `agent-memory` extraction rule — keep invariants, cause→effect, counter-moves,
   symptom fingerprints; drop narratives, dates, attempt logs, anything code/git already states.
2. Route each surviving atom to its node's section (Facts / Invariants / Gotchas / Pointers;
   genuinely in-flight state → `Status`, dated).
3. On conflict between records, the version consistent with **current code** wins — check the
   code, don't average.
4. Procedure-shaped survivors do not enter nodes — route them to `memory-promotion`. Routing
   means distilling them into general rules, never handing the text over verbatim.

## Folding in an outside store

1. Union every source. Two same-named files are two drifted sources of ONE node — merge both;
   the code-consistent version wins.
2. Index-only entries with no backing file: extract the fact into its node, or drop if stale.
3. `## Skills` / "Key Files" index sections are dropped — skills self-describe; harness layout
   belongs to `AGENTS.md`. Move genuinely non-obvious dispatch hints there.
4. When the new store verifies (below), delete every merged source entirely.

## Regenerate the index

Rebuild `MEMORY.md` from the resulting nodes per the `agent-memory` format — never edit the old
index incrementally.

## Verify

- Every node file is listed in the index; every listed node exists; every wiki-link resolves.
- All caps met (index ≤ 50 lines; nodes ≤ 120; entries ≤ 3 lines; Status ≤ 5 dated lines).
- No dates outside `Status` and `updated:`; no event-keyed filenames.
- The root `AGENTS.md` Memory section points at `.agents/memory/`.
- `.agents/memory/` is the only memory store left: every merged source directory or file is
  deleted, and nothing in the harness still points at one.

## Report

One table: **Node** | **Sources merged** | **Lines before → after**. Follow the Reporting rule
(what, not why).
