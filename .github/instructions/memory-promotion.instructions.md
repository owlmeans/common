---
description: "Promote procedure-shaped or hot memory into skills/instructions — triggers (procedure test, promote? flags, over-cap), update-vs-create rule, post-promotion pointer state. Apply when converting memory content into guidance files or when a promote? flag appears in a memory node."
applyTo: "**/.agents/memory/**, **/.claude/skills/**, **/.github/instructions/**"
---

# Memory promotion

Memory holds **facts**; **procedures** belong in instructions/skills, where they auto-apply and
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

**Default is update** — extend the existing instruction/skill whose scope covers the activity,
even partially; keep both twins in sync. Create a NEW pair only when:

- (a) a new subsystem or technology entered the repo;
- (b) an activity with no covering instruction needed memory read/write more than once (a
  re-encountered ` → promote?` flag);
- (c) an external technology required internet docs and has no governing instruction.

New instructions multiply lookup cost — compactness applies to the guidance population too.

## Procedure

1. Collect the flagged / procedure-shaped memory lines.
2. Author or extend the `.github/instructions/<name>.instructions.md` and its
   `.claude/skills/<name>/SKILL.md` twin, following the repo's skill-authoring / create-skill
   conventions.
3. Shrink the node: delete the promoted prose; leave one pointer line (format below).
4. Remove the ` → promote?` flags.
5. Update the node's index hook if its main value moved; bump `updated:`.
6. Report per the Reporting rule.

## Post-promotion state

The node keeps exactly one line under `## Pointers`:

```
- <activity> → skill `<name>` (procedure lives in .claude/skills/<name>/ + .github/instructions/<name>.instructions.md)
```
