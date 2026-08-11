---
description: "Mandatory post-development skill/instruction updating — after adding or changing functionality, rewrite touched project guidance as current rules (never as change notes), note external-doc findings in the governing instruction, or add instructions for new subsystems/technologies; required before the completion report when development started from an agreed plan. Apply when editing skills or instruction files after development."
applyTo: "**/.claude/skills/**, **/.github/instructions/**"
scope: general
---

# Self-education

After functionality is added or changed, the guidance that describes it must catch up — the agent
teaches itself for next time. This pass runs after implementation and verification, **before**
the completion report.

## When (mandatory)

Development "started from planning" when the session produced a plan the operator approved before
implementation — a plan approval, an agreed written plan/spec, or an explicit "go ahead" on a
proposed approach. **Approval of a plan is simultaneously approval of its implicit final step:
this self-education pass.** A planned task is not finishable without it. If guidance files cannot
be edited (read-only run), list the required updates in the report instead.

Also recommended after any unplanned change that made an existing instruction/skill inaccurate.

## Review checklist

For each area the work touched:

1. Which existing instruction/skill covers it? (Check `.github/instructions/` +
   `.claude/skills/`.)
2. Do its commands, paths, APIs, and behavior claims still hold after the change?
3. Fix in place — rewrite the affected lines so they describe current behavior; never append a
   note about what this change did. Keep the instruction and its skill twin in sync.

## Shape of an update

Instructions and skills state **current rules, not what changed**. Every edit is a rewrite in
place of the affected lines.

Never write into an instruction or skill: dated bulletins ("2026-07-05 — …"), phase or migration
status ("Phase 3 complete", "migration done", "landed"), "formerly X, now Y", incident
narratives, fixed-bug logs, or point-in-time inventories. If a line only makes sense to someone
who watched the change happen, it does not belong in guidance — the rule it taught does, stated
timelessly. Facts too specific to generalize go to `.agents/memory/`
(`.github/instructions/agent-memory.instructions.md`); the rewrite recipe is
`.github/instructions/memory-promotion.instructions.md` → Distillation.

Test: a finished instruction reads as though the feature was always this way.

## Non-project instructions

If a general or imported instruction gained an important usage pattern during the work, add the
pattern to the **deployed copy** in this repo and note it in the report as an upstream
candidate — canonical archive copies change only on explicit operator request.

## External docs

If the work required reading internet documentation for an external API, library, or service,
the governing instruction must record it under an `## External docs` heading:

```
- <URL> — <one-line gist of what it settled> (<version/date if load-bearing>)
```

Governing instruction = the project instruction covering the touched area; else the one covering
that library; if none exists and the technology will recur, create one (update-vs-create rule in
`.github/instructions/memory-promotion.instructions.md`). Never leave doc findings only in
memory or the conversation.

## New subsystems / technologies

When new technology or a new subsystem entered the repo: create the instruction/skill pair for
its procedures, and/or the `.agents/memory/` node for its facts — split along the
memory-vs-instruction boundary (`.github/instructions/agent-memory.instructions.md` /
`.github/instructions/memory-promotion.instructions.md`).

## Completion gate

The completion report must contain a Self-education table:

| Item | Action | Path |
|---|---|---|
| <area/skill> | updated / created / none-needed | <path> |

"none-needed" requires a one-phrase reason. A post-plan completion report without this table is
a protocol violation.
