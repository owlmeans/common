---
description: "Shared agent memory protocol for the .agents/memory/ graph store (single store for Copilot and Claude Code) — MEMORY.md index, subsystem nodes, compact-on-write, size caps, read protocol. Apply when reading or writing project memory, or when any legacy .claude/memory or .github/memory path appears."
applyTo: "**/.agents/memory/**, **/.claude/memory/**, **/.github/memory/**"
scope: general
---

# Agent memory (`.agents/memory/`)

One shared memory store per repository, used by **both** GitHub Copilot and Claude Code: a graph
of subsystem nodes rooted in the `MEMORY.md` index. Compactness is the core value — every write
merges and compacts; nothing is ever appended as a log.

Never write memory to `.claude/memory/`, `.github/memory/`, `~/.copilot/`, `~/.claude/`, or
anywhere outside the repository. Legacy `.claude/memory/` / `.github/memory/` stores are
retired — if one exists, flag it for migration
(`.github/instructions/memory-recompact.instructions.md`) instead of writing there.

## Store layout

```
.agents/memory/
├── MEMORY.md     # graph root: the only always-read file
└── <node>.md     # one file per subsystem / concern / integration
```

Flat directory — graph structure lives in scopes and wiki-links, not subdirectories.

## Node naming

Node id = lowercase-kebab name of the **project-structure part** the knowledge attaches to:

1. **Subsystem** — workspace dir / package name: `manager-web`, `auth`, `vslots`. Deepest
   unambiguous segment; prefix with the parent only on collision.
2. **Cross-cutting concern** spanning subsystems: `build`, `testing`, `deploy`, `routing`, `i18n`.
3. **Integration** — external service/library: `stripe`, `cloudflare`, `openrouter`.
4. **`workspace`** — repo-level facts that fit nowhere else (remotes, branch topology, env model).

File is `<node>.md`; the id is the wiki-link target: `[[manager-web]]`. **Never** key a node to an
event, date, phase, investigation, or task name.

## Index format (`MEMORY.md`)

```markdown
# Memory Graph — <project>

Shared agent memory (`agent-memory` protocol). Read this file at session start.
Before non-trivial work, open every node whose scope matches the task's files or topics.

## Subsystems
- [[manager-web]] `sources/manager-web/**` — i18n 8-domain split; owl-theme wiring
## Cross-cutting
- [[build]] `**/tsconfig*.json` — tsbuildinfo path pinning; tolerant library builds
## Integrations
- [[stripe]] `ext:stripe` — sandbox topology; webhook fan-out
```

Rules: exactly one line per node — `- [[<node>]] ` + backticked scope + ` — <hook>`; hook ≤ 100
chars; no dates; only non-empty groups; file ≤ 50 lines; no skills listed (skills self-describe).
The scope column is the router: match the task's paths/topics against scopes to decide which
nodes to open.

## Node format

Frontmatter — exactly three fields:

```yaml
---
node: vslots                 # = filename without .md; = wiki-link target
scope: "scripts/vslots/**"   # repo-relative globs; ext:<service> for integrations; . for workspace
updated: 2026-08             # month granularity only
---
```

Body — only non-empty sections, in this order:

- `## Facts` — what IS: structure, behavior, topology. 1–3 lines each.
- `## Invariants` — what MUST HOLD; optionally "broke when violated: <symptom>".
- `## Gotchas` — symptom → cause → counter-move, ≤ 3 lines each.
- `## Pointers` — key files, promoted-skill pointer lines, `External docs` (URL + gist).
- `## Status` — optional; in-flight state only; every line dated; prune resolved lines on every read.

`Status` is the **only** place dates and unfinished-work notes are allowed. Link related nodes
inline with `[[node]]`.

## Read protocol

- **Session start**: read `.agents/memory/MEMORY.md` — the index only.
- **Before a non-trivial task**: open every node whose scope matches the task (typically 1–3).
- **When a topic surfaces mid-session** that the index names: open its node before acting.
- **Never bulk-read** the store — the index + scopes exist so you don't have to.

## Write protocol (compact-on-write)

Every write is a merge, never an append:

1. **Extract** — reduce the outcome to reusable knowledge atoms (rule below). Nothing survives →
   write nothing.
2. **Locate** — match scopes to find the node; none matches → create one per the naming rule and
   add its index line.
3. **Merge / supersede** — place each atom in the right section; if it refines or contradicts an
   existing line, **rewrite that line in place** — never append a dated correction. The node
   always reads as current truth.
4. **Compact** — reread the node; collapse redundancy; delete anything the code or git history
   now states; prune resolved `Status` lines.
5. **Cap** — over soft cap: compact harder. Over hard cap: split by sub-scope into a linked child
   node, or promote procedure-shaped overflow
   (`.github/instructions/memory-promotion.instructions.md`, else the skill-authoring guidance).
6. **Index** — update the hook line if the node's center of gravity moved; bump `updated:`.

## Knowledge, not events

**Record the rule, not the story.** For every line ask: *what must a future agent know to act
correctly, stated without reference to this session?* Keep invariants, cause→effect,
counter-moves, recognition fingerprints (symptoms). Drop dates, phase numbers, who did what,
attempt sequences, and anything recoverable from code or git.

Before (event log): "Verification 2026-06-11 … Bug found: script missing embedded-count logic.
Fix deployed to all copies; second run idempotent."
After (knowledge): "`nested-agent-context.sh` exists as byte-identical copies in the archive and
each repo — fan every fix out to all copies; verify with `diff`. Correct re-runs are no-ops."

## Size caps (hard)

| Thing | Cap |
|---|---|
| Index entry | 1 line, hook ≤ 100 chars |
| `MEMORY.md` | ≤ 50 lines |
| Node file (soft / hard) | 80 / 120 lines |
| Single fact/gotcha | ≤ 3 lines |
| `Status` section | ≤ 5 dated lines |
| Nodes per store (soft) | ~25 — merge low-traffic siblings beyond |

## Memory vs instruction

Fact-shaped ("what is true") stays here. Procedure-shaped ("to do X, do Y") becomes an
instruction/skill — follow `.github/instructions/memory-promotion.instructions.md` where present,
otherwise the skill-authoring guidance. Repeated use of a node to *perform* tasks, and over-cap
nodes full of steps, are promotion triggers.
