---
name: memory-promotion
description: Transform procedure-shaped or repeatedly-used memory into skills and instructions — the procedure-shape test, the mandatory distillation rewrite, promote? repeated-touch flags, over-cap trigger, update-vs-create decision, and the post-promotion pointer state. Use when memory content reads as "how to", when a promote? flag is encountered again, when writing memory-derived content into a skill, or during recompaction.
user-invocable: true
metadata:
  scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Memory promotion

Memory holds **facts**; **procedures** belong in skills/instructions, where they auto-invoke and
stop consuming memory-read cycles. Promotion is how the store stays compact and the harness
teaches itself.

Promotion is a **rewrite, never a move**. Memory text pasted into a skill is the single most
common way this harness degrades — see Distillation below.

## Triggers

- **Procedure shape**: the content answers *how to do X* — ordered steps, imperative verbs,
  command lines, if-this-do-that tables. Promote it.
- **Repeated touch**: an existing ` → promote?` flag on content you are touching again means
  promote now; if mid-task, promotion becomes the first row of the completion report.
- **Over-cap**: a node past the 120-line hard cap with roughly a third or more procedure-shaped
  content → promote the procedures instead of splitting the node.
- Corroborating only (weak — agents don't commit, so only user commits appear):
  `git log --oneline -- .agents/memory/<node>.md` showing ≥ 3 commits within ~a month marks a
  hot node worth evaluating.

## Procedure-shape test

Procedure-shaped answers *how to do X*: ordered steps, imperative verbs, commands, action tables.
Fact-shaped answers *what is true*: declarative structure, invariants, symptom→cause pairs.
Mixed entries split — the fact stays in the node, the "then do" is distilled into a rule in the
skill.

## Distillation (mandatory)

**Never paste memory text into a skill.** A promoted line leaves the node as prose about a past
occurrence and enters the skill as **one general rule**: *when this applies → do this → or this
breaks*, stated so it holds next time rather than describing last time.

| Strip | Keep |
|---|---|
| dates, phase/status markers, "COMPLETE", "landed" | the condition that makes the rule apply |
| versions, image tags, SHAs — unless the rule turns on the version | the step to take |
| "was X, now Y", "the former X was removed" | the failure it prevents |
| who did it, attempt sequences, incident narrative | the recognition fingerprint (symptom) |
| point-in-time inventories, counts, snapshots | |

Before (memory): "2026-07-05 — the control-board git card was removed; the dialog now owns all
git actions."
After (rule): "Git actions live in the git dialog; the control board holds none."

Before (memory): "Phase 3 (COMPLETE, 2026-06-13): added the init-container build, publisher
`src/build.ts`, kephemeral v0.1.5."
After (rule): "Production images build in an init container driven by `publisher/src/build.ts`."

**If the rule cannot be stated without saying when it happened, it is not promotable** — it stays
a memory fact, or it is dropped.

### Budget

A promotion normally adds **1–5 lines** to an existing skill, and a single rule is ≤ 3 lines. A
whole new section, or more text added than the node lost, means the content was moved rather than
distilled — redo it.

A skill may legitimately run long when it maps a large subsystem, so length alone is not the test:
**every line must be a rule, a contract, or a pointer.** A section that reads as the story of how
the code got there is pollution at any length. "Record the rule, not the story" (`agent-memory`)
binds skill bodies at least as tightly as it binds nodes.

## Flagging (how content earns promotion)

When you **merge** procedure-shaped content into a node, or you **use** (not merely check) a
node's content to perform a task, append ` → promote?` to that line or section heading.
Evaluable by reading the file alone — no tooling required.

## Update vs create

**Default is update** — extend the existing skill/instruction whose scope covers the activity,
even partially; keep both twins in sync. Create a NEW pair only when:

- (a) a new subsystem or technology entered the repo;
- (b) an activity with no covering skill needed memory read/write more than once (a
  re-encountered ` → promote?` flag);
- (c) an external technology required internet docs and has no governing skill.

New skills multiply lookup cost — compactness applies to the skill population *and* to each
skill's body.

## Procedure

1. Collect the flagged / procedure-shaped memory lines.
2. **Distill** each into a general rule (section above). Not optional — skipping it is the
   failure mode this skill exists to prevent.
3. Author or extend the skill at `.agents/skills/<name>/SKILL.md`, following the repo's
   `skill-authoring` or `create-skill` conventions. Where an existing rule
   already covers the ground, **rewrite that rule in place**; append only when nothing covers it.
4. Shrink the node: delete the source lines; leave one pointer line (format below).
5. Remove the ` → promote?` flags.
6. Update the node's index hook if its main value moved; bump `updated:`.
7. Report per the Reporting rule.

## Post-promotion state

The node keeps exactly one line under `## Pointers`:

```
- <activity> → skill `<name>` (procedure lives in .agents/skills/<name>/)
```
