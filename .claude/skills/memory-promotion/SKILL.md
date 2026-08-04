---
name: memory-promotion
description: Transform procedure-shaped or repeatedly-used memory into skills and instructions — the procedure-shape test, promote? repeated-touch flags, over-cap trigger, update-vs-create decision, and the post-promotion pointer state. Use when memory content reads as "how to", when a promote? flag is encountered again, or during recompaction.
user-invocable: true
---

# Memory promotion

Memory holds **facts**; **procedures** belong in skills/instructions, where they auto-invoke and
stop consuming memory-read cycles. Promotion is how the store stays compact and the harness
teaches itself.

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
Mixed entries split — the fact stays in the node, the "then do" moves out.

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

New skills multiply lookup cost — compactness applies to the skill population too.

## Procedure

1. Collect the flagged / procedure-shaped memory lines.
2. Author or extend the SKILL.md and its `.github/instructions/<name>.instructions.md` twin,
   following the repo's `skill-authoring` or `create-skill` conventions.
3. Shrink the node: delete the promoted prose; leave one pointer line (format below).
4. Remove the ` → promote?` flags.
5. Update the node's index hook if its main value moved; bump `updated:`.
6. Report per the Reporting rule.

## Post-promotion state

The node keeps exactly one line under `## Pointers`:

```
- <activity> → skill `<name>` (procedure lives in .claude/skills/<name>/ + .github/instructions/<name>.instructions.md)
```
